import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useClients,
  useClientDetail,
  useCreateClient,
  useUpdateClient,
  useClientTags,
  useMigrateFromCustomers,
  useCreateClientNote,
  useFindAllDuplicates,
  useMergeClients,
  type ClientListItem,
  type DuplicateGroup,
} from "@/hooks/use-clients";
import { useSelectedStore } from "@/hooks/use-store";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import {
  Plus, Search, Download, Upload, Filter, Tag, Users,
  Phone, Mail, ArrowUpDown, RefreshCw, Loader2, ChevronLeft,
  ChevronRight, Pencil, Star, ExternalLink, Calendar,
  DollarSign, MoreHorizontal, MessageSquare, FileText, BookOpen,
  GitMerge, CheckCircle2,
} from "lucide-react";
import { ExportDialog } from "@/components/clients/ExportDialog";
import { ImportDialog } from "@/components/clients/ImportDialog";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { formatPhoneInput } from "@/lib/utils";
import debounce from "lodash.debounce";
import { format, isToday, isYesterday, differenceInDays, parseISO } from "date-fns";

// ─── Status computation ───────────────────────────────────────────────────────
// Derived purely from existing client data — no DB or API changes needed.
//
// Precedence (intentional):
//   1. VIP   — explicit DB flag always wins
//   2. Inactive — no visit for 120+ days (lost relationship, even if visit count < 3)
//   3. At Risk  — no visit for 45-119 days (needs re-engagement even if relatively new)
//   4. New      — < 3 visits and visited recently (still building the relationship)
//   5. Regular  — 3+ visits, visited recently

type ComputedStatus = "new" | "regular" | "vip" | "at_risk" | "inactive";

function getComputedStatus(client: ClientListItem): ComputedStatus {
  if (client.clientStatus === "vip") return "vip";

  const lastVisit = client.lastVisitAt ? parseISO(client.lastVisitAt) : null;
  const daysSince = lastVisit != null ? differenceInDays(new Date(), lastVisit) : null;

  if (daysSince == null || daysSince >= 120) return "inactive";
  if (daysSince >= 45) return "at_risk";
  if (client.totalVisits < 3) return "new";
  return "regular";
}

// ─── Last visit formatting ────────────────────────────────────────────────────

function formatLastVisit(dateStr: string | null): string {
  if (!dateStr) return "Never";
  try {
    const date = parseISO(dateStr);
    if (isNaN(date.getTime())) return "Never";
    if (isToday(date)) return "Today";
    if (isYesterday(date)) return "Yesterday";
    const days = differenceInDays(new Date(), date);
    if (days <= 30) return `${days} days ago`;
    return format(date, "MMM d, yyyy");
  } catch {
    return "Never";
  }
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<ComputedStatus, { label: string; className: string }> = {
  new:      { label: "🆕 New",     className: "bg-blue-50 text-blue-700 border-blue-200" },
  regular:  { label: "● Regular",  className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  vip:      { label: "⭐ VIP",     className: "bg-amber-50 text-amber-700 border-amber-200" },
  at_risk:  { label: "⚠ At Risk", className: "bg-orange-50 text-orange-700 border-orange-200" },
  inactive: { label: "Inactive",   className: "bg-slate-50 text-slate-400 border-slate-200" },
};

function StatusBadge({ status }: { status: ComputedStatus }) {
  const { label, className } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${className}`}>
      {label}
    </span>
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SORT_KEYS = [
  "fullName",
  "fullName-desc",
  "lastVisitAt-desc",
  "totalSpent-desc",
  "totalVisits-desc",
  "createdAt-desc",
] as const;

type SortKey = typeof SORT_KEYS[number];

const TAB_VALUES = ["all", "new", "regular", "vip", "at_risk", "inactive"] as const;
type TabValue = typeof TAB_VALUES[number];

const LIMIT = 50;
// For computed-status tabs we fetch a larger batch and filter client-side
const COMPUTED_LIMIT = 500;

// ─── Main component ───────────────────────────────────────────────────────────

export default function Customers() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const { pick, language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();

  // ── Translations ──
  const t = {
    title:          pick({ en: "Clients",       vi: "Khách hàng",          es: "Clientes",             fr: "Clients" }),
    manageDb:       pick({ en: "Manage your client database", vi: "Quản lý cơ sở dữ liệu khách hàng", es: "Gestiona tu base de datos de clientes", fr: "Gérez votre base de données clients" }),
    totalClients:   (n: number) =>
      language === "vi" ? `${n.toLocaleString()} khách hàng`
      : language === "es" ? `${n.toLocaleString()} clientes en total`
      : language === "fr" ? `${n.toLocaleString()} clients au total`
      : `${n.toLocaleString()} total clients`,
    import:         pick({ en: "Import",      vi: "Nhập",            es: "Importar",             fr: "Importer" }),
    export:         pick({ en: "Export",      vi: "Xuất",            es: "Exportar",             fr: "Exporter" }),
    addClient:      pick({ en: "Add Client",  vi: "Thêm khách hàng", es: "Agregar cliente",      fr: "Ajouter un client" }),
    syncContacts:   pick({ en: "Sync contacts", vi: "Đồng bộ liên hệ", es: "Sincronizar contactos", fr: "Synchroniser contacts" }),
    importBanner:   pick({ en: "Import your existing contacts",              vi: "Nhập danh bạ hiện có của bạn",    es: "Importa tus contactos existentes",    fr: "Importez vos contacts existants" }),
    importBannerSub: pick({ en: "Migrate your booking history contacts into the new client database.", vi: "Di chuyển danh sách đặt lịch sang cơ sở dữ liệu khách hàng mới.", es: "Migra tus contactos del historial de reservas a la nueva base de datos.", fr: "Migrez vos contacts de l'historique de réservations vers la nouvelle base de données." }),
    search:         pick({ en: "Search by name, email, or phone...", vi: "Tìm theo tên, email hoặc số điện thoại...", es: "Buscar por nombre, email o teléfono...", fr: "Rechercher par nom, email ou téléphone..." }),
    allTags:        pick({ en: "All tags",    vi: "Tất cả thẻ",      es: "Todas las etiquetas",  fr: "Tous les tags" }),
    filter:         pick({ en: "Filter",      vi: "Lọc",             es: "Filtrar",              fr: "Filtrer" }),
    filter1:        pick({ en: "1 filter",    vi: "1 bộ lọc",        es: "1 filtro",             fr: "1 filtre" }),
    // Tab labels
    tabAll:         pick({ en: "All Clients", vi: "Tất cả",          es: "Todos",                fr: "Tous" }),
    tabNew:         pick({ en: "New",         vi: "Mới",             es: "Nuevo",                fr: "Nouveau" }),
    tabRegular:     pick({ en: "Regular",     vi: "Thường xuyên",    es: "Regular",              fr: "Régulier" }),
    tabVip:         "VIP",
    tabAtRisk:      pick({ en: "At Risk",     vi: "Có nguy cơ",      es: "En riesgo",            fr: "À risque" }),
    tabInactive:    pick({ en: "Inactive",    vi: "Không hoạt động", es: "Inactivo",             fr: "Inactif" }),
    // Column headers
    colClient:      pick({ en: "Client",        vi: "Khách hàng",      es: "Cliente",              fr: "Client" }),
    colContact:     pick({ en: "Contact",        vi: "Liên hệ",         es: "Contacto",             fr: "Contact" }),
    colStatus:      pick({ en: "Status",         vi: "Trạng thái",      es: "Estado",               fr: "Statut" }),
    colVisits:      pick({ en: "Visits",         vi: "Lượt thăm",       es: "Visitas",              fr: "Visites" }),
    colSpend:       pick({ en: "Lifetime Spend", vi: "Chi tiêu trọn đời", es: "Gasto total",        fr: "Dépenses totales" }),
    colLastVisit:   pick({ en: "Last Visit",     vi: "Lần thăm gần nhất", es: "Última visita",      fr: "Dernière visite" }),
    colActions:     pick({ en: "Actions",        vi: "Hành động",       es: "Acciones",             fr: "Actions" }),
    // Sort options
    sortNameAZ:     pick({ en: "Name A–Z",              vi: "Tên A–Z",              es: "Nombre A–Z",               fr: "Nom A–Z" }),
    sortNameZA:     pick({ en: "Name Z–A",              vi: "Tên Z–A",              es: "Nombre Z–A",               fr: "Nom Z–A" }),
    sortLastVisit:  pick({ en: "Last Visit (recent)",   vi: "Lần thăm gần nhất",   es: "Última visita (reciente)", fr: "Dernière visite (récente)" }),
    sortHighSpend:  pick({ en: "Highest spend",         vi: "Chi tiêu cao nhất",    es: "Mayor gasto",              fr: "Dépenses les plus élevées" }),
    sortMostVisits: pick({ en: "Most visits",           vi: "Nhiều lượt thăm nhất", es: "Más visitas",              fr: "Plus de visites" }),
    sortNewest:     pick({ en: "Newest clients",        vi: "Khách hàng mới nhất",  es: "Clientes más nuevos",      fr: "Clients les plus récents" }),
    // Actions
    viewProfile:    pick({ en: "View Profile",      vi: "Xem hồ sơ",         es: "Ver perfil",           fr: "Voir profil" }),
    bookAppt:       pick({ en: "Book Appointment",  vi: "Đặt lịch hẹn",      es: "Reservar cita",        fr: "Prendre RDV" }),
    sendMessage:    pick({ en: "Send Message",      vi: "Gửi tin nhắn",      es: "Enviar mensaje",       fr: "Envoyer message" }),
    addNote:        pick({ en: "Add Note",          vi: "Thêm ghi chú",      es: "Agregar nota",         fr: "Ajouter note" }),
    edit:           pick({ en: "Edit",              vi: "Chỉnh sửa",         es: "Editar",               fr: "Modifier" }),
    // Empty states
    emptyAll:       pick({ en: "No clients yet",                 vi: "Chưa có khách hàng", es: "Aún no hay clientes", fr: "Aucun client" }),
    emptyAllSub:    pick({ en: "Add your first client or import a list to get started.", vi: "Thêm khách hàng đầu tiên hoặc nhập danh sách.", es: "Agrega tu primer cliente o importa una lista.", fr: "Ajoutez votre premier client ou importez une liste." }),
    addFirstClient: pick({ en: "Add first client", vi: "Thêm khách đầu tiên", es: "Agregar primer cliente", fr: "Ajouter premier client" }),
    atRiskShortcut: pick({ en: "At-Risk",           vi: "Có nguy cơ",        es: "En riesgo",            fr: "À risque" }),
    // Note dialog
    noteTitle:      (name: string) => pick({ en: `Add Note — ${name}`, vi: `Thêm ghi chú — ${name}`, es: `Agregar nota — ${name}`, fr: `Ajouter note — ${name}` }),
    notePlaceholder: pick({ en: "Enter a note about this client...", vi: "Nhập ghi chú về khách hàng này...", es: "Ingresa una nota sobre este cliente...", fr: "Entrez une note sur ce client..." }),
    noteSuccess:    pick({ en: "Note added",         vi: "Đã thêm ghi chú",   es: "Nota agregada",        fr: "Note ajoutée" }),
    cancel:         pick({ en: "Cancel",             vi: "Hủy",               es: "Cancelar",             fr: "Annuler" }),
    saveNote:       pick({ en: "Save Note",          vi: "Lưu ghi chú",       es: "Guardar nota",         fr: "Enregistrer note" }),
    fullProfile:    pick({ en: "Full Profile",       vi: "Hồ sơ đầy đủ",      es: "Perfil completo",      fr: "Profil complet" }),
    noContactInfo:  pick({ en: "No contact info",   vi: "Không có liên hệ",   es: "Sin información",      fr: "Pas de contact" }),
    // Empty states — status tabs
    emptyNewTitle:    pick({ en: "No new clients",        vi: "Không có khách hàng mới",      es: "No hay clientes nuevos",         fr: "Aucun nouveau client" }),
    emptyNewSub:      pick({ en: "New clients have fewer than 3 completed visits.", vi: "Khách mới có dưới 3 lần ghé thăm.", es: "Los clientes nuevos tienen menos de 3 visitas.", fr: "Les nouveaux clients ont moins de 3 visites." }),
    emptyRegTitle:    pick({ en: "No regular clients yet",    vi: "Chưa có khách thường xuyên",   es: "Aún no hay clientes regulares",  fr: "Pas encore de clients réguliers" }),
    emptyRegSub:      pick({ en: "Regular clients have 3+ visits and were seen recently.", vi: "Khách thường xuyên có 3+ lượt thăm gần đây.", es: "Los regulares tienen 3+ visitas recientes.", fr: "Les réguliers ont 3+ visites récentes." }),
    emptyVipTitle:    pick({ en: "No VIP clients",           vi: "Không có khách VIP",           es: "No hay clientes VIP",            fr: "Aucun client VIP" }),
    emptyVipSub:      pick({ en: "VIP status is set manually on the client profile.", vi: "Trạng thái VIP được đặt thủ công.", es: "El estado VIP se configura manualmente.", fr: "Le statut VIP est défini manuellement." }),
    emptyRiskTitle:   pick({ en: "No at-risk clients",       vi: "Không có khách có nguy cơ",    es: "No hay clientes en riesgo",      fr: "Aucun client à risque" }),
    emptyRiskSub:     pick({ en: "Clients who haven't visited in 45–119 days appear here.", vi: "Khách chưa ghé 45–119 ngày hiển thị ở đây.", es: "Clientes sin visita en 45–119 días.", fr: "Clients sans visite depuis 45–119 jours." }),
    emptyInactTitle:  pick({ en: "No inactive clients",      vi: "Không có khách không hoạt động", es: "No hay clientes inactivos",    fr: "Aucun client inactif" }),
    emptyInactSub:    pick({ en: "Clients who haven't visited in 120+ days appear here.", vi: "Khách chưa ghé 120+ ngày hiển thị ở đây.", es: "Clientes sin visita en 120+ días.", fr: "Clients sans visite depuis 120+ jours." }),
    emptySearchTitle: (q: string) => pick({ en: `No clients match "${q}"`, vi: `Không tìm thấy khách khớp "${q}"`, es: `Sin resultados para "${q}"`, fr: `Aucun client pour "${q}"` }),
    emptySearchSub:   pick({ en: "Try a different name, email, or phone number.", vi: "Thử tên, email hoặc số điện thoại khác.", es: "Intenta con otro nombre, email o teléfono.", fr: "Essayez un autre nom, email ou téléphone." }),
  };

  const SORT_OPTIONS: { value: SortKey; label: string }[] = [
    { value: "fullName",          label: t.sortNameAZ },
    { value: "fullName-desc",     label: t.sortNameZA },
    { value: "lastVisitAt-desc",  label: t.sortLastVisit },
    { value: "totalSpent-desc",   label: t.sortHighSpend },
    { value: "totalVisits-desc",  label: t.sortMostVisits },
    { value: "createdAt-desc",    label: t.sortNewest },
  ];

  const STATUS_TABS: { value: TabValue; label: string }[] = [
    { value: "all",      label: t.tabAll },
    { value: "new",      label: t.tabNew },
    { value: "regular",  label: t.tabRegular },
    { value: "vip",      label: t.tabVip },
    { value: "at_risk",  label: t.tabAtRisk },
    { value: "inactive", label: t.tabInactive },
  ];

  // ── State ──
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<TabValue>("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sort, setSort] = useState<SortKey>("fullName");
  const [page, setPage] = useState(1);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isDuplicateOpen, setIsDuplicateOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientListItem | null>(null);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [noteTarget, setNoteTarget] = useState<ClientListItem | null>(null);

  const { mutate: migrateFromCustomers, isPending: isMigrating } = useMigrateFromCustomers();

  const [sortField, sortOrder] = sort.includes("-desc")
    ? [sort.replace("-desc", ""), "desc"]
    : [sort, "asc"];

  const debouncedSetSearch = useCallback(
    debounce((val: string) => { setDebouncedSearch(val); setPage(1); }, 350),
    []
  );

  function handleSearchChange(val: string) {
    setSearch(val);
    debouncedSetSearch(val);
  }

  // "vip" uses the API-level filter; every other non-"all" tab fetches a larger
  // batch and filters client-side so the backend needs no changes.
  const isComputedFilter = status !== "all" && status !== "vip";
  const apiStatus = status === "vip" ? "vip" : undefined;

  const { data, isLoading } = useClients({
    search: debouncedSearch || undefined,
    status: apiStatus,
    tag: selectedTag !== "all" ? selectedTag : undefined,
    sort: sortField,
    order: sortOrder as "asc" | "desc",
    page: isComputedFilter ? 1 : page,
    limit: isComputedFilter ? COMPUTED_LIMIT : LIMIT,
  });

  const { data: tags = [] } = useClientTags();

  const rawClients = data?.clients ?? [];
  const clients = isComputedFilter
    ? rawClients.filter(c => getComputedStatus(c) === status)
    : rawClients;

  const totalPages = isComputedFilter ? 1 : Math.ceil((data?.total ?? 0) / LIMIT);
  const serverTotal = data?.total ?? 0;

  function handleMigrate() {
    migrateFromCustomers(undefined, {
      onSuccess: (res: any) => {
        toast({ title: t.noteSuccess, description: `${res.migrated} clients migrated.` });
      },
    });
  }

  return (
    <AppLayout>
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">{t.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {serverTotal > 0 ? t.totalClients(serverTotal) : t.manageDb}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}>
            <Upload className="w-4 h-4 mr-1.5" />{t.import}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsExportOpen(true)}>
            <Download className="w-4 h-4 mr-1.5" />{t.export}
          </Button>
          <Link to="/clients/at-risk">
            <Button variant="outline" size="sm" className="border-orange-300 text-orange-700 hover:bg-orange-50">
              <Users className="w-4 h-4 mr-1.5" />{t.atRiskShortcut}
            </Button>
          </Link>
          <Button variant="outline" size="sm" onClick={() => setIsDuplicateOpen(true)} className="border-violet-300 text-violet-700 hover:bg-violet-50">
            <GitMerge className="w-4 h-4 mr-1.5" />Find Duplicates
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-white shadow-sm">
            <Plus className="w-4 h-4 mr-1.5" />{t.addClient}
          </Button>
        </div>
      </div>

      {/* ── Migration banner ── */}
      {serverTotal === 0 && !isLoading && (
        <div className="mb-4 p-4 rounded-xl border bg-amber-50 border-amber-200 flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-sm text-amber-900">{t.importBanner}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t.importBannerSub}</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleMigrate} disabled={isMigrating} className="border-amber-300 bg-white text-amber-900 hover:bg-amber-50 shrink-0">
            {isMigrating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            {t.syncContacts}
          </Button>
        </div>
      )}

      {/* ── Card shell ── */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden mb-4">

        {/* Filters bar */}
        <div className="p-3 flex flex-col sm:flex-row gap-2 border-b">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t.search}
              className="pl-9 h-9 text-sm"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-9 w-auto text-sm gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-sm">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tags.length > 0 && (
              <Button
                variant={showFilters ? "secondary" : "outline"}
                size="sm"
                className="h-9 gap-1.5"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedTag !== "all" ? t.filter1 : t.filter}
              </Button>
            )}
          </div>
        </div>

        {/* Tag filter row */}
        {showFilters && tags.length > 0 && (
          <div className="px-4 py-3 border-b bg-muted/30 flex flex-wrap gap-2 items-center">
            <Tag className="w-3.5 h-3.5 text-muted-foreground" />
            <button
              onClick={() => setSelectedTag("all")}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedTag === "all" ? "bg-primary text-white border-primary" : "border-border hover:bg-muted/50"}`}
            >
              {t.allTags}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setSelectedTag(selectedTag === tag.tagName ? "all" : tag.tagName)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${
                  selectedTag === tag.tagName ? "text-white border-transparent" : "border-border hover:bg-muted/50"
                }`}
                style={selectedTag === tag.tagName ? { backgroundColor: tag.tagColor, borderColor: tag.tagColor } : {}}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selectedTag === tag.tagName ? "white" : tag.tagColor }} />
                {tag.tagName}
                {tag.count !== undefined && (
                  <span className={selectedTag === tag.tagName ? "opacity-75" : "text-muted-foreground"}>({tag.count})</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Status tabs */}
        <div className="px-4 pt-3 pb-0 overflow-x-auto">
          <Tabs value={status} onValueChange={(v) => { setStatus(v as TabValue); setPage(1); }}>
            <TabsList className="bg-transparent h-auto p-0 gap-0 border-b-0 flex-nowrap">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-4 pb-3 text-sm font-medium whitespace-nowrap"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {/* ── Mobile cards ── */}
        <div className="md:hidden divide-y">
          {isLoading ? (
            <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></div>
          ) : clients.length === 0 ? (
            <EmptyState search={debouncedSearch} status={status} t={t} onAdd={() => setIsCreateOpen(true)} />
          ) : (
            clients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                t={t}
                onEdit={() => setEditingClient(client)}
                onOpen={() => setSelectedClientId(client.id)}
                onNote={() => setNoteTarget(client)}
              />
            ))
          )}
        </div>

        {/* ── Desktop table ── */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-5 py-3 font-medium">{t.colClient}</th>
                <th className="px-5 py-3 font-medium">{t.colContact}</th>
                <th className="px-5 py-3 font-medium">{t.colStatus}</th>
                <th className="px-5 py-3 font-medium">{t.colVisits}</th>
                <th className="px-5 py-3 font-medium">{t.colSpend}</th>
                <th className="px-5 py-3 font-medium">{t.colLastVisit}</th>
                <th className="px-5 py-3 font-medium w-10">{t.colActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr><td colSpan={7} className="p-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
              ) : clients.length === 0 ? (
                <tr><td colSpan={7}><EmptyState search={debouncedSearch} status={status} t={t} onAdd={() => setIsCreateOpen(true)} /></td></tr>
              ) : (
                clients.map((client) => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    t={t}
                    onOpen={() => setSelectedClientId(client.id)}
                    onEdit={() => setEditingClient(client)}
                    onNote={() => setNoteTarget(client)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination (only for server-filtered tabs) */}
        {!isComputedFilter && totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t text-sm text-muted-foreground">
            <span>
              {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, serverTotal)} of {serverTotal.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="h-8 w-8 p-0">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="px-2">{page} / {totalPages}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="h-8 w-8 p-0">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Result count for computed filters */}
        {isComputedFilter && clients.length > 0 && (
          <div className="px-5 py-3 border-t text-xs text-muted-foreground">
            {clients.length} {clients.length === 1 ? "client" : "clients"} in this category
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <CreateClientDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
      <ExportDialog open={isExportOpen} onOpenChange={setIsExportOpen} />
      <ImportDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
      <EditClientDialog client={editingClient} onOpenChange={(open) => { if (!open) setEditingClient(null); }} />
      <AddNoteDialog client={noteTarget} t={t} onOpenChange={(open) => { if (!open) setNoteTarget(null); }} />
      <ClientDetailSheet
        clientId={selectedClientId}
        t={t}
        onClose={() => setSelectedClientId(null)}
        onEdit={(client) => { setSelectedClientId(null); setEditingClient(client); }}
        onNote={(client) => { setSelectedClientId(null); setNoteTarget(client); }}
      />
      <DuplicateMergeDialog open={isDuplicateOpen} onOpenChange={setIsDuplicateOpen} />
    </AppLayout>
  );
}

// ─── Client Avatar ─────────────────────────────────────────────────────────────

function ClientAvatar({ name, isVip }: { name: string; isVip: boolean }) {
  const initials = name
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";
  return (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isVip ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"}`}>
      {initials}
    </div>
  );
}

// ─── Desktop row ──────────────────────────────────────────────────────────────

type TDict = ReturnType<typeof buildT>;
// We pass `t` as a prop so these sub-components share the same translation context.
function buildT(_dummy: unknown) { return {} as any; } // type helper only

function ClientRow({
  client,
  t,
  onOpen,
  onEdit,
  onNote,
}: {
  client: ClientListItem;
  t: any;
  onOpen: () => void;
  onEdit: () => void;
  onNote: () => void;
}) {
  const navigate = useNavigate();
  const computedStatus = getComputedStatus(client);

  return (
    <tr className="hover:bg-muted/20 transition-colors group">
      {/* CLIENT */}
      <td className="px-5 py-3 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-3">
          <ClientAvatar name={client.fullName} isVip={client.clientStatus === "vip"} />
          <div>
            <p className="font-semibold text-sm group-hover:text-primary transition-colors">
              {client.fullName || "No name"}
            </p>
            {(client.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-0.5">
                {client.tags.slice(0, 2).map((tag) => (
                  <span
                    key={tag.id}
                    className="text-[10px] px-1.5 py-0 rounded-full text-white font-medium leading-4"
                    style={{ backgroundColor: tag.tagColor }}
                  >
                    {tag.tagName}
                  </span>
                ))}
                {client.tags.length > 2 && (
                  <span className="text-[10px] text-muted-foreground">+{client.tags.length - 2}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </td>

      {/* CONTACT */}
      <td className="px-5 py-3">
        <div className="space-y-0.5">
          {client.primaryEmail && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[160px]">{client.primaryEmail}</span>
            </div>
          )}
          {client.primaryPhone && (
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Phone className="w-3 h-3 shrink-0" />
              <span>{client.primaryPhone}</span>
            </div>
          )}
          {!client.primaryEmail && !client.primaryPhone && (
            <span className="text-xs text-muted-foreground/60">{t.noContactInfo}</span>
          )}
        </div>
      </td>

      {/* STATUS */}
      <td className="px-5 py-3">
        <StatusBadge status={computedStatus} />
      </td>

      {/* VISITS */}
      <td className="px-5 py-3">
        <span className="font-medium">{client.totalVisits}</span>
      </td>

      {/* LIFETIME SPEND */}
      <td className="px-5 py-3">
        <span className="font-medium">${((client.totalSpentCents ?? 0) / 100).toFixed(2)}</span>
        {(client.loyaltyPoints ?? 0) > 0 && (
          <div className="flex items-center gap-0.5 text-amber-600 text-xs mt-0.5">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            {client.loyaltyPoints} pts
          </div>
        )}
      </td>

      {/* LAST VISIT */}
      <td className="px-5 py-3">
        <span className={`text-sm ${
          !client.lastVisitAt ? "text-muted-foreground/60"
          : computedStatus === "at_risk" ? "text-orange-600 font-medium"
          : computedStatus === "inactive" ? "text-slate-400"
          : "text-foreground"
        }`}>
          {formatLastVisit(client.lastVisitAt)}
        </span>
      </td>

      {/* ACTIONS */}
      <td className="px-3 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)}>
              <ExternalLink className="w-3.5 h-3.5 mr-2" />{t.viewProfile}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/booking/new?clientId=${client.id}`)}>
              <BookOpen className="w-3.5 h-3.5 mr-2" />{t.bookAppt}
            </DropdownMenuItem>
            {client.primaryPhone && (
              <DropdownMenuItem onClick={() => navigate(`/sms-inbox?clientId=${client.id}`)}>
                <MessageSquare className="w-3.5 h-3.5 mr-2" />{t.sendMessage}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5 mr-2" />{t.edit}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onNote}>
              <FileText className="w-3.5 h-3.5 mr-2" />{t.addNote}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

// ─── Mobile Client Card ───────────────────────────────────────────────────────

function ClientCard({
  client,
  t,
  onEdit,
  onOpen,
  onNote,
}: {
  client: ClientListItem;
  t: any;
  onEdit: () => void;
  onOpen: () => void;
  onNote: () => void;
}) {
  const navigate = useNavigate();
  const computedStatus = getComputedStatus(client);

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors">
      <button onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <ClientAvatar name={client.fullName} isVip={client.clientStatus === "vip"} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{client.fullName || "No name"}</p>
          <p className="text-xs text-muted-foreground truncate">
            {client.primaryEmail || client.primaryPhone || t.noContactInfo}
          </p>
          <div className="mt-1"><StatusBadge status={computedStatus} /></div>
        </div>
        <div className="text-right text-xs text-muted-foreground shrink-0">
          <p className="font-medium text-foreground">{client.totalVisits} visits</p>
          <p>{formatLastVisit(client.lastVisitAt)}</p>
        </div>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground shrink-0">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => navigate(`/clients/${client.id}`)}>
            <ExternalLink className="w-3.5 h-3.5 mr-2" />{t.viewProfile}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate(`/booking/new?clientId=${client.id}`)}>
            <BookOpen className="w-3.5 h-3.5 mr-2" />{t.bookAppt}
          </DropdownMenuItem>
          {client.primaryPhone && (
            <DropdownMenuItem onClick={() => navigate(`/sms-inbox?clientId=${client.id}`)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" />{t.sendMessage}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="w-3.5 h-3.5 mr-2" />{t.edit}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onNote}>
            <FileText className="w-3.5 h-3.5 mr-2" />{t.addNote}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ search, status, t, onAdd }: { search: string; status: TabValue; t: any; onAdd: () => void }) {
  const statusCopy: Record<TabValue, { title: string; sub: string }> = {
    all:      { title: t.emptyAll,       sub: t.emptyAllSub },
    new:      { title: t.emptyNewTitle,  sub: t.emptyNewSub },
    regular:  { title: t.emptyRegTitle,  sub: t.emptyRegSub },
    vip:      { title: t.emptyVipTitle,  sub: t.emptyVipSub },
    at_risk:  { title: t.emptyRiskTitle, sub: t.emptyRiskSub },
    inactive: { title: t.emptyInactTitle, sub: t.emptyInactSub },
  };
  const copy = search
    ? { title: t.emptySearchTitle(search), sub: t.emptySearchSub }
    : statusCopy[status];

  return (
    <div className="p-12 text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto">
        <Users className="w-6 h-6 text-muted-foreground" />
      </div>
      <div>
        <p className="font-semibold text-sm">{copy.title}</p>
        <p className="text-xs text-muted-foreground mt-1">{copy.sub}</p>
      </div>
      {!search && status === "all" && (
        <Button size="sm" onClick={onAdd} className="bg-primary text-white hover:bg-primary/90">
          <Plus className="w-4 h-4 mr-1.5" />{t.addFirstClient}
        </Button>
      )}
    </div>
  );
}

// ─── Add Note Dialog ──────────────────────────────────────────────────────────

function AddNoteDialog({
  client,
  t,
  onOpenChange,
}: {
  client: ClientListItem | null;
  t: any;
  onOpenChange: (open: boolean) => void;
}) {
  const { selectedStore } = useSelectedStore();
  const { mutate, isPending } = useCreateClientNote();
  const { toast } = useToast();
  const [content, setContent] = useState("");

  function handleClose() {
    setContent("");
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!client || !content.trim() || !selectedStore) return;
    mutate(
      { clientId: client.id, storeId: selectedStore.id, noteContent: content.trim(), noteType: "general" },
      {
        onSuccess: () => { toast({ title: t.noteSuccess }); handleClose(); },
        onError: () => toast({ title: "Failed to save note", variant: "destructive" }),
      }
    );
  }

  return (
    <Dialog open={!!client} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.noteTitle(client?.fullName || "Client")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Textarea
            placeholder={t.notePlaceholder}
            className="resize-none"
            rows={4}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={handleClose}>{t.cancel}</Button>
            <Button size="sm" disabled={!content.trim() || isPending} onClick={handleSubmit} className="bg-primary text-white hover:bg-primary/90">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />}
              {t.saveNote}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Client Dialog ───────────────────────────────────────────────────────

function EditClientDialog({
  client,
  onOpenChange,
}: {
  client: ClientListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { mutate, isPending } = useUpdateClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, setValue: setEditValue } = useForm<{
    firstName: string; lastName: string; phone: string;
  }>();

  function onSubmit(data: { firstName: string; lastName: string; phone: string }) {
    if (!client) return;
    mutate({ id: client.id, ...data }, {
      onSuccess: () => { toast({ title: "Client updated" }); onOpenChange(false); },
      onError: () => toast({ title: "Failed to update client", variant: "destructive" }),
    });
  }

  function handleOpenChange(v: boolean) { if (!v) reset(); onOpenChange(v); }

  if (!client) return null;

  const parts = (client.fullName ?? "").trim().split(" ");
  const firstNameDefault = parts[0] ?? "";
  const lastNameDefault = parts.slice(1).join(" ");

  return (
    <Dialog open={!!client} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Edit Client</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" key={client.id}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...register("firstName")} defaultValue={firstNameDefault} placeholder="Jane" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...register("lastName")} defaultValue={lastNameDefault} placeholder="Doe" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              {...register("phone")}
              defaultValue={formatPhoneInput(client.primaryPhone ?? "")}
              onChange={(e) => {
                const formatted = formatPhoneInput(e.target.value);
                e.currentTarget.value = formatted;
                setEditValue("phone", formatted, { shouldDirty: true });
              }}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Client Detail Sheet ──────────────────────────────────────────────────────

function ClientDetailSheet({
  clientId,
  t,
  onClose,
  onEdit,
  onNote,
}: {
  clientId: number | null;
  t: any;
  onClose: () => void;
  onEdit: (client: ClientListItem) => void;
  onNote: (client: ClientListItem) => void;
}) {
  const navigate = useNavigate();
  const { data: client, isLoading } = useClientDetail(clientId);

  return (
    <Sheet open={!!clientId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        {isLoading || !client ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <SheetHeader className="mb-6">
              <div className="flex items-start gap-4">
                <ClientAvatar name={client.fullName || "?"} isVip={client.clientStatus === "vip"} />
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-lg leading-tight">{client.fullName || "No name"}</SheetTitle>
                  <div className="mt-1">
                    <StatusBadge status={getComputedStatus(client as unknown as ClientListItem)} />
                  </div>
                  {client.primaryPhone && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Phone className="w-3 h-3" />{client.primaryPhone}
                    </p>
                  )}
                  {client.primaryEmail && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
                      <Mail className="w-3 h-3 shrink-0" />{client.primaryEmail}
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5"><Calendar className="w-3 h-3" />Visits</p>
                <p className="text-xl font-bold">{client.totalVisits}</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5"><DollarSign className="w-3 h-3" />Lifetime Spend</p>
                <p className="text-xl font-bold">${((client.totalSpentCents ?? 0) / 100).toFixed(2)}</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5"><Star className="w-3 h-3" />Loyalty Points</p>
                <p className="text-xl font-bold text-amber-600">{client.loyaltyPoints ?? 0}</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-0.5">Last Visit</p>
                <p className="text-sm font-semibold leading-tight">{formatLastVisit(client.lastVisitAt)}</p>
              </div>
            </div>

            {/* Tags */}
            {(client.tags ?? []).length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">Tags</p>
                <div className="flex flex-wrap gap-1.5">
                  {client.tags.map((t: any) => {
                    const tag = t.tag ?? t;
                    return (
                      <span key={tag.id ?? t.tagId} className="text-xs px-2.5 py-1 rounded-full text-white font-medium" style={{ backgroundColor: tag.tagColor }}>
                        {tag.tagName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quick actions grid */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <Button variant="outline" size="sm" onClick={() => navigate(`/booking/new?clientId=${client.id}`)}>
                <BookOpen className="w-3.5 h-3.5 mr-1.5" />{t.bookAppt}
              </Button>
              {client.primaryPhone && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); navigate(`/sms-inbox?clientId=${client.id}`); }}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1.5" />{t.sendMessage}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => { onClose(); onNote(client as unknown as ClientListItem); }}>
                <FileText className="w-3.5 h-3.5 mr-1.5" />{t.addNote}
              </Button>
              <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(client as unknown as ClientListItem); }}>
                <Pencil className="w-3.5 h-3.5 mr-1.5" />{t.edit}
              </Button>
            </div>
            <Button size="sm" className="w-full" onClick={() => { onClose(); navigate(`/clients/${client.id}`); }}>
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />{t.fullProfile}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Create Client Dialog ─────────────────────────────────────────────────────

function CreateClientDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { mutate, isPending } = useCreateClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, setValue: setAddValue } = useForm<{
    firstName: string; lastName: string; email: string; phone: string; notes: string; allergies: string;
  }>();

  function onSubmit(data: any) {
    mutate(data, {
      onSuccess: () => { toast({ title: "Client added" }); reset(); onOpenChange(false); },
      onError: (err: any) => { toast({ title: "Failed to add client", description: err.message, variant: "destructive" }); },
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add New Client</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input {...register("firstName")} placeholder="Jane" />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input {...register("lastName")} placeholder="Doe" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" {...register("email")} placeholder="jane@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              {...register("phone")}
              onChange={(e) => {
                const formatted = formatPhoneInput(e.target.value);
                e.currentTarget.value = formatted;
                setAddValue("phone", formatted, { shouldDirty: true });
              }}
              placeholder="(555) 123-4567"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Allergies / Sensitivities</Label>
            <Input {...register("allergies")} placeholder="e.g. Latex, Ammonia, Perm solution..." />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input {...register("notes")} placeholder="Preferences, special requests..." />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="bg-primary text-white hover:bg-primary/90">
              {isPending ? "Adding..." : "Add Client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Duplicate Merge Dialog ───────────────────────────────────────────────────

const REASON_BADGE: Record<DuplicateGroup["reason"], { label: string; className: string }> = {
  phone: { label: "Same phone",  className: "bg-blue-50 text-blue-700 border-blue-200" },
  email: { label: "Same email",  className: "bg-violet-50 text-violet-700 border-violet-200" },
  name:  { label: "Same name",   className: "bg-amber-50 text-amber-700 border-amber-200" },
};

function DuplicateMergeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const { data, isLoading, refetch, isFetching } = useFindAllDuplicates(open);
  const { mutate: merge, isPending: isMerging } = useMergeClients();

  const [winners, setWinners] = useState<Record<string, number>>({});
  const [merged, setMerged] = useState<Set<string>>(new Set());
  const [mergingKey, setMergingKey] = useState<string | null>(null);

  const groups = data?.groups ?? [];
  const remaining = groups.filter(g => !merged.has(g.key));

  function handleMerge(group: DuplicateGroup) {
    const winnerId = winners[group.key] ?? group.clients[0]?.id;
    if (!winnerId || !selectedStore?.id) return;
    const loserIds = group.clients.map(c => c.id).filter(id => id !== winnerId);
    setMergingKey(group.key);
    merge(
      { storeId: selectedStore.id, winnerId, loserIds },
      {
        onSuccess: () => {
          setMerged(prev => new Set([...prev, group.key]));
          setMergingKey(null);
          const keepName = group.clients.find(c => c.id === winnerId)?.fullName ?? "client";
          toast({ title: "Clients merged", description: `Kept "${keepName}" and archived ${loserIds.length} duplicate${loserIds.length !== 1 ? "s" : ""}.` });
        },
        onError: (err: any) => {
          setMergingKey(null);
          toast({ title: "Merge failed", description: err?.message ?? "Something went wrong.", variant: "destructive" });
        },
      }
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-violet-600" />
            Find &amp; Merge Duplicates
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between pb-3 border-b">
          <p className="text-sm text-muted-foreground">
            {isLoading || isFetching
              ? "Scanning for duplicates…"
              : remaining.length === 0
                ? groups.length === 0 ? "No duplicate clients found." : "All duplicates resolved ✓"
                : `${remaining.length} duplicate group${remaining.length !== 1 ? "s" : ""} found`}
          </p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching} className="text-muted-foreground">
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
            Rescan
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-1">
          {(isLoading || isFetching) && remaining.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Scanning…</span>
            </div>
          )}

          {!isLoading && !isFetching && remaining.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              <p className="text-sm font-medium">
                {groups.length === 0
                  ? "Your client list is clean — no duplicates found."
                  : "All duplicates have been resolved!"}
              </p>
            </div>
          )}

          {remaining.map(group => {
            const winnerId = winners[group.key] ?? group.clients[0]?.id;
            const isBusy = mergingKey === group.key;
            const badge = REASON_BADGE[group.reason];
            return (
              <div key={group.key} className="rounded-xl border shadow-sm overflow-hidden">
                {/* Group header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge.className}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                      {group.matchValue}
                    </span>
                  </div>
                  <Button
                    size="sm"
                    disabled={isBusy || isMerging}
                    onClick={() => handleMerge(group)}
                    className="bg-violet-600 hover:bg-violet-700 text-white h-7 px-3 text-xs"
                  >
                    {isBusy
                      ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                      : <GitMerge className="w-3.5 h-3.5 mr-1" />}
                    Merge
                  </Button>
                </div>

                {/* Client rows — click to choose which to keep */}
                <div className="divide-y">
                  {group.clients.map(client => {
                    const isWinner = client.id === winnerId;
                    return (
                      <button
                        key={client.id}
                        type="button"
                        onClick={() => setWinners(prev => ({ ...prev, [group.key]: client.id }))}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isWinner ? "bg-violet-50" : "hover:bg-muted/30"}`}
                      >
                        {/* Radio indicator */}
                        <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${isWinner ? "border-violet-600 bg-violet-600" : "border-gray-300"}`}>
                          {isWinner && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        {/* Avatar */}
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isWinner ? "bg-violet-100 text-violet-700" : "bg-primary/10 text-primary"}`}>
                          {client.fullName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2)}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{client.fullName}</span>
                            {isWinner && (
                              <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                                KEEP
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            {client.primaryPhone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="w-3 h-3" />{client.primaryPhone}
                              </span>
                            )}
                            {client.primaryEmail && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Mail className="w-3 h-3" />{client.primaryEmail}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Stats */}
                        <div className="text-right shrink-0 hidden sm:block">
                          <div className="text-xs font-medium">{client.totalVisits} visit{client.totalVisits !== 1 ? "s" : ""}</div>
                          <div className="text-xs text-muted-foreground">
                            ${((client.totalSpentCents ?? 0) / 100).toFixed(0)} spent
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground">
                  Click a row to choose which record to keep. The other{group.clients.length > 2 ? "s" : ""} will be archived — visits, contacts &amp; notes merged in.
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
