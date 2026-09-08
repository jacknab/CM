import { useNavigate } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/use-features";
import { useMemo, useState } from "react";
import { Search, Bell, ChevronDown, LayoutDashboard, AlertTriangle, Trash2, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";
import { buildSettingsNav, type SettingsNavItem } from "@/lib/settings-nav";

function ModuleCard({
  mod,
  onClick,
  className,
}: {
  mod: SettingsNavItem;
  onClick: () => void;
  className?: string;
}) {
  const Icon = mod.icon;
  return (
    <button
      onClick={onClick}
      title={mod.description}
      className={cn(
        "flex flex-col items-center justify-center gap-3 bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 cursor-pointer border border-slate-100 h-[150px]",
        className
      )}
    >
      <div className={`w-[54px] h-[54px] rounded-full flex items-center justify-center ${mod.iconBg}`}>
        <Icon className={`w-6 h-6 ${mod.iconColor}`} />
      </div>
      <span className="text-[13px] font-semibold text-slate-700 text-center leading-snug">
        {mod.label}
      </span>
    </button>
  );
}

export default function SettingsLanding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const features = useFeatureFlags();
  const { pick } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const t = {
    title:          pick({ en: "Settings",                              vi: "Cài đặt",                          es: "Ajustes",                           fr: "Paramètres" }),
    subtitle:       pick({ en: "Everything you can configure for your salon, grouped by what it affects.", vi: "Mọi thứ bạn có thể cấu hình cho salon, nhóm theo mục đích.", es: "Todo lo que puedes configurar en tu salón, agrupado por área.", fr: "Tout ce que vous pouvez configurer pour votre salon, regroupé par domaine." }),
    searchSettings: pick({ en: "Search settings…",                     vi: "Tìm kiếm cài đặt…",                es: "Buscar ajustes…",                    fr: "Rechercher dans les paramètres…" }),
    dashboard:      pick({ en: "Dashboard",                             vi: "Tổng quan",                        es: "Panel",                             fr: "Tableau de bord" }),
    noMatch:        (q: string) => pick({ en: `No settings match "${q}"`, vi: `Không có cài đặt nào khớp "${q}"`, es: `Ningún ajuste coincide con "${q}"`, fr: `Aucun paramètre ne correspond à « ${q} »` }),
    dangerZone:     pick({ en: "Danger Zone",                           vi: "Vùng nguy hiểm",                   es: "Zona de peligro",                   fr: "Zone sensible" }),
    dangerBlurb:    pick({ en: "Permanently delete your account and every bit of data tied to it — clients, appointments, staff, payments, everything. This cannot be undone.", vi: "Xóa vĩnh viễn tài khoản và toàn bộ dữ liệu liên quan — khách hàng, lịch hẹn, nhân viên, thanh toán. Không thể hoàn tác.", es: "Elimina de forma permanente tu cuenta y todos los datos asociados: clientes, citas, personal, pagos, todo. No se puede deshacer.", fr: "Supprime définitivement votre compte et toutes les données associées : clients, rendez-vous, personnel, paiements, tout. Irréversible." }),
    deleteBtn:      pick({ en: "Delete my account",                     vi: "Xóa tài khoản của tôi",            es: "Eliminar mi cuenta",                fr: "Supprimer mon compte" }),
  };

  const groups = useMemo(() => {
    return buildSettingsNav(pick).filter((g) => !(g.requiresPos && !features.pos));
  }, [pick, features.pos]);

  const allModules = groups.flatMap((g) => g.items);
  const q = searchQuery.trim().toLowerCase();
  const filteredModules = q
    ? allModules.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
      )
    : null;

  const initials =
    [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() ||
    (user?.firstName?.[0] ?? user?.email?.[0] ?? "U").toUpperCase();

  const handleDeleteAccount = async () => {
    if (confirmPhrase !== "DELETE MY ACCOUNT") {
      setDeleteError('Please type "DELETE MY ACCOUNT" exactly to confirm.');
      return;
    }
    setIsDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.message || "Deletion failed. Please try again.");
        setIsDeleting(false);
        return;
      }
      window.location.href = "/auth";
    } catch {
      setDeleteError("Network error. Please try again.");
      setIsDeleting(false);
    }
  };

  const DeleteAccountModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Delete account permanently</h2>
            <p className="text-sm text-slate-500">This cannot be undone.</p>
          </div>
          <button onClick={() => { setShowDeleteModal(false); setConfirmPhrase(""); setDeleteError(""); }} className="ml-auto text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-5 text-sm text-red-700 space-y-1">
          <p className="font-semibold">The following will be permanently deleted:</p>
          <ul className="list-disc list-inside space-y-0.5 text-red-600">
            <li>Your store and all business settings</li>
            <li>All client records and appointment history</li>
            <li>All staff, payments, and financial data</li>
            <li>All SMS, email, and communication history</li>
            <li>Your login and account credentials</li>
          </ul>
        </div>

        <p className="text-sm text-slate-600 mb-3">
          Type <span className="font-mono font-bold text-slate-800">DELETE MY ACCOUNT</span> to confirm:
        </p>
        <input
          type="text"
          value={confirmPhrase}
          onChange={(e) => { setConfirmPhrase(e.target.value); setDeleteError(""); }}
          placeholder="DELETE MY ACCOUNT"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm font-mono mb-1 focus:outline-none focus:border-red-400 focus:ring-1 focus:ring-red-300"
          autoFocus
        />
        {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}

        <div className="flex gap-3 mt-4">
          <button
            onClick={() => { setShowDeleteModal(false); setConfirmPhrase(""); setDeleteError(""); }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteAccount}
            disabled={isDeleting || confirmPhrase !== "DELETE MY ACCOUNT"}
            className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isDeleting ? "Deleting…" : "Delete everything"}
          </button>
        </div>
      </div>
    </div>
  );

  const GroupedGrid = ({ cardClass, cols }: { cardClass?: string; cols: string }) => (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-3">{g.heading}</h2>
          <div className={cn("grid gap-4", cols)}>
            {g.items.map((mod) => (
              <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} className={cardClass} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );

  const FlatGrid = ({ cardClass, cols }: { cardClass?: string; cols: string }) => (
    <div className={cn("grid gap-4", cols)}>
      {(filteredModules ?? []).map((mod) => (
        <ModuleCard key={mod.to} mod={mod} onClick={() => navigate(mod.to)} className={cardClass} />
      ))}
    </div>
  );

  const NoResults = () => (
    <div className="flex flex-col items-center gap-3 py-20 text-slate-400">
      <Search className="w-10 h-10 opacity-30" />
      <p className="text-sm font-medium">{t.noMatch(searchQuery)}</p>
    </div>
  );

  /* ─── MOBILE LAYOUT ─── */
  if (isMobile) {
    return (
      <div className="relative min-h-screen bg-white overflow-hidden flex flex-col">
        <div className="pointer-events-none absolute top-0 right-0 w-48 h-40 opacity-30" aria-hidden>
          <svg viewBox="0 0 200 180" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <ellipse cx="170" cy="30" rx="130" ry="90" fill="#e2e8f0" />
            <ellipse cx="200" cy="100" rx="100" ry="70" fill="#cbd5e1" />
          </svg>
        </div>

        <div className="relative z-10 flex-1 flex flex-col px-5 pt-14 pb-4 overflow-y-auto">
          <div className="absolute top-6 left-5 right-5 flex items-center justify-between">
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, fontSize: "1.55rem", letterSpacing: "-0.02em", color: "#3B0764", lineHeight: 1 }}>
              Certxa<span style={{ color: "#F59E0B" }}>.</span>
            </span>
            <button className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white text-sm font-bold shadow-md" onClick={() => navigate("/account")}>
              {initials}
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2.5 shadow-sm">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={t.searchSettings}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
              <Bell className="w-4 h-4 text-slate-400 shrink-0" />
            </div>
          </div>

          <div className="mb-5">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">{t.title}</h1>
            <p className="text-slate-500 mt-1 text-base">{t.subtitle}</p>
          </div>

          {filteredModules
            ? filteredModules.length === 0
              ? <NoResults />
              : <FlatGrid cols="grid-cols-3" cardClass="h-[110px] p-3 gap-2 rounded-xl" />
            : <GroupedGrid cols="grid-cols-3" cardClass="h-[110px] p-3 gap-2 rounded-xl" />}

          {/* Mobile danger zone */}
          <div className="mt-8 mb-4 border border-red-200 rounded-2xl p-4 bg-red-50">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-sm font-bold text-red-700">{t.dangerZone}</span>
            </div>
            <p className="text-xs text-red-600 mb-3">{t.dangerBlurb}</p>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {t.deleteBtn}
            </button>
          </div>
        </div>

        <div className="relative z-20 bg-white border-t border-slate-100 flex items-center justify-around" style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 60px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          <button className="flex flex-col items-center gap-1 px-6 py-2" onClick={() => navigate("/manage")}>
            <LayoutDashboard className="w-6 h-6 text-teal-500" />
            <span className="text-[11px] font-semibold text-teal-500">{t.dashboard}</span>
          </button>
        </div>
        {showDeleteModal && <DeleteAccountModal />}
      </div>
    );
  }

  /* ─── DESKTOP LAYOUT ─── */
  return (
    <AppLayout>
      <div className="relative min-h-full">
        <div className="pointer-events-none absolute top-0 right-0 w-96 h-64 opacity-30" aria-hidden>
          <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <ellipse cx="320" cy="60" rx="220" ry="140" fill="#e2e8f0" />
            <ellipse cx="380" cy="160" rx="160" ry="100" fill="#cbd5e1" />
          </svg>
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-end gap-3 mb-8 pt-1">
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-4 py-2 shadow-sm w-56">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder={t.searchSettings}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent outline-none text-sm text-slate-600 placeholder:text-slate-400 w-full"
              />
            </div>
            <button className="relative w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 transition-colors">
              <Bell className="w-4 h-4 text-slate-600" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white" />
            </button>
            <button className="flex items-center gap-2 bg-white border border-slate-200 rounded-full pl-1 pr-3 py-1 shadow-sm hover:bg-slate-50 transition-colors" onClick={() => navigate("/account")}>
              <div className="w-7 h-7 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{initials}</div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-800 leading-tight">{t.title}</h1>
            <p className="text-slate-500 mt-1">{t.subtitle}</p>
          </div>

          {filteredModules
            ? filteredModules.length === 0
              ? <NoResults />
              : <FlatGrid cols="grid-cols-5" />
            : <GroupedGrid cols="grid-cols-5" />}

          {/* Desktop danger zone */}
          <div className="mt-12 border border-red-200 rounded-2xl p-6 bg-red-50">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-bold text-red-700">{t.dangerZone}</span>
                </div>
                <p className="text-sm text-red-600">{t.dangerBlurb}</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="ml-6 shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                {t.deleteBtn}
              </button>
            </div>
          </div>
        </div>
      </div>
      {showDeleteModal && <DeleteAccountModal />}
    </AppLayout>
  );
}
