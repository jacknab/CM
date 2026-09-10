import { useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import {
  Search, ChevronLeft, ArrowUpRight, AlertTriangle, Trash2, X,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { useFeatureFlags } from "@/hooks/use-features";
import { cn } from "@/lib/utils";
import { buildSettingsNav, type SettingsNavItem } from "@/lib/settings-nav";
import { SettingsShellContext } from "@/lib/settings-shell-context";

// Section components mounted in the detail pane. Each still renders its own
// <AppLayout>; inside the shell that collapses to a bare padded wrapper
// (see AppLayout + settings-shell-context).
import BusinessSettings from "@/pages/BusinessSettings";
import BusinessHoursPage from "@/pages/BusinessHoursPage";
import LanguageSettings from "@/pages/LanguageSettings";
import CalendarSettings from "@/pages/CalendarSettings";
import OnlineBooking from "@/pages/OnlineBooking";
import ResourceSettings from "@/pages/settings/ResourceSettings";
import KioskSettings from "@/pages/KioskSettings";
import PayoutAccountSettings from "@/pages/settings/PayoutAccountSettings";
import POSSettings from "@/pages/POSSettings";
import PayrollSettings from "@/pages/PayrollSettings";
import SmsSettings from "@/pages/SmsSettings";
import MailSettings from "@/pages/MailSettings";
import TranslationsPage from "@/pages/TranslationsPage";
import DataTransferPage from "@/pages/DataTransferPage";
import FeaturesSettings from "@/pages/FeaturesSettings";
import CalendarSyncSettings from "@/pages/CalendarSyncSettings";

const PANES: Record<string, React.ComponentType> = {
  "business": BusinessSettings,
  "hours": BusinessHoursPage,
  "language": LanguageSettings,
  "booking-controls": CalendarSettings,
  "online-booking": OnlineBooking,
  "resources": ResourceSettings,
  "kiosk": KioskSettings,
  "payout-account": PayoutAccountSettings,
  "pos": POSSettings,
  "commission": PayrollSettings,
  "sms": SmsSettings,
  "email": MailSettings,
  "translations": TranslationsPage,
  "data-transfer": DataTransferPage,
  "advanced": FeaturesSettings,
  "calendar-sync": CalendarSyncSettings,
};

const DEFAULT_SLUG = "business";

export default function SettingsShell() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const features = useFeatureFlags();
  const { pick } = useLanguage();
  const [query, setQuery] = useState("");

  const t = {
    title:        pick({ en: "Settings",          vi: "Cài đặt",        es: "Ajustes",          fr: "Paramètres" }),
    search:       pick({ en: "Search settings…",  vi: "Tìm cài đặt…",   es: "Buscar ajustes…",  fr: "Rechercher…" }),
    back:         pick({ en: "Settings",          vi: "Cài đặt",        es: "Ajustes",          fr: "Paramètres" }),
    opensPage:    pick({ en: "Opens as its own page", vi: "Mở ở trang riêng", es: "Se abre en su propia página", fr: "S'ouvre sur sa propre page" }),
    noMatch:      pick({ en: "No settings match your search", vi: "Không có cài đặt phù hợp", es: "Ningún ajuste coincide", fr: "Aucun paramètre ne correspond" }),
    account:      pick({ en: "Account",           vi: "Tài khoản",      es: "Cuenta",           fr: "Compte" }),
    deleteLabel:  pick({ en: "Delete Account",    vi: "Xóa tài khoản",  es: "Eliminar cuenta",  fr: "Supprimer le compte" }),
  };

  const groups = useMemo(
    () => buildSettingsNav(pick).filter((g) => !(g.requiresPos && !features.pos)),
    [pick, features.pos],
  );

  const allItems = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const q = query.trim().toLowerCase();
  const matches = (it: SettingsNavItem) =>
    !q || it.label.toLowerCase().includes(q) || it.description.toLowerCase().includes(q);

  // ── routing guards ────────────────────────────────────────────────────────
  if (!section) {
    // Desktop lands on the first section; mobile shows the rail as its own
    // screen. Use a synchronous width check — useIsMobile() reports false on the
    // very first render, which would otherwise flash-redirect on phones.
    const isWide = typeof window !== "undefined" && window.innerWidth >= 768;
    if (isWide) return <Navigate to={`/settings/${DEFAULT_SLUG}`} replace />;
  } else if (section !== "delete-account" && !PANES[section]) {
    // Unknown slug — an external item's slug or a typo. If it maps to a nav
    // item, bounce to its real route; otherwise go to the default section.
    const ext = allItems.find((i) => i.slug === section);
    return <Navigate to={ext ? ext.to : `/settings/${DEFAULT_SLUG}`} replace />;
  }

  const activeSlug = section ?? null;
  const activeItem = allItems.find((i) => i.slug === activeSlug) ?? null;
  const Pane = activeSlug && activeSlug !== "delete-account" ? PANES[activeSlug] : null;

  const goToItem = (it: SettingsNavItem) => {
    if (it.external) navigate(it.to);
    else navigate(`/settings/${it.slug}`);
  };

  // ── left rail ─────────────────────────────────────────────────────────────
  const Rail = (
    <nav
      className={cn(
        "flex flex-col gap-1 overflow-y-auto",
        isMobile ? "flex-1 px-3 pb-24 pt-2" : "w-[268px] shrink-0 border-r border-border px-3 py-4",
      )}
    >
      <div className="sticky top-0 z-10 -mx-3 mb-2 bg-background px-3 pb-2 pt-1">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="settings-search"
          />
        </div>
      </div>

      {groups.map((g) => {
        const items = g.items.filter(matches);
        if (!items.length) return null;
        return (
          <div key={g.key} className="mb-1">
            <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {g.heading}
            </p>
            {items.map((it) => {
              const Icon = it.icon;
              const active = it.slug === activeSlug;
              return (
                <button
                  key={it.slug}
                  onClick={() => goToItem(it)}
                  title={it.description}
                  data-testid={`settings-nav-${it.slug}`}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                    active
                      ? "bg-primary/10 font-medium text-foreground"
                      : "text-foreground/80 hover:bg-muted",
                  )}
                >
                  <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", it.iconBg)}>
                    <Icon className={cn("h-4 w-4", it.iconColor)} />
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.external && (
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}

      {!q && (
        <div className="mb-1">
          <p className="px-2 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t.account}
          </p>
          <button
            onClick={() => navigate("/settings/delete-account")}
            data-testid="settings-nav-delete-account"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
              activeSlug === "delete-account"
                ? "bg-destructive/10 font-medium text-destructive"
                : "text-destructive/80 hover:bg-destructive/10",
            )}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-destructive/10">
              <Trash2 className="h-4 w-4 text-destructive" />
            </span>
            <span className="flex-1 truncate">{t.deleteLabel}</span>
          </button>
        </div>
      )}

      {q && !groups.some((g) => g.items.some(matches)) && (
        <p className="px-2 py-8 text-center text-sm text-muted-foreground">{t.noMatch}</p>
      )}
    </nav>
  );

  // ── detail pane ──────────────────────────────────────────────────────────
  const Detail = (
    <div className="flex flex-1 flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3 md:px-6">
        {isMobile && (
          <button
            onClick={() => navigate("/settings")}
            className="-ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-primary hover:bg-muted"
            data-testid="settings-back"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.back}
          </button>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground" data-testid="settings-section-title">
            {activeSlug === "delete-account" ? t.deleteLabel : (activeItem?.label ?? t.title)}
          </h1>
          {activeItem?.description && (
            <p className="truncate text-xs text-muted-foreground">{activeItem.description}</p>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {activeSlug === "delete-account" ? (
          <DeleteAccountSection />
        ) : Pane ? (
          <SettingsShellContext.Provider value={true}>
            <Pane />
          </SettingsShellContext.Provider>
        ) : null}
      </div>
    </div>
  );

  // ── layout ───────────────────────────────────────────────────────────────
  return (
    <AppLayout fullHeight>
      {isMobile ? (
        <div className="flex h-full flex-col bg-background">
          {section ? Detail : (
            <>
              <header className="border-b border-border px-4 py-3">
                <h1 className="text-xl font-bold text-foreground">{t.title}</h1>
              </header>
              {Rail}
            </>
          )}
        </div>
      ) : (
        <div className="flex h-full bg-background">
          {Rail}
          {Detail}
        </div>
      )}
    </AppLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Danger Zone — moved here from the old SettingsLanding page.

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const doDelete = async () => {
    if (phrase !== "DELETE MY ACCOUNT") {
      setError('Please type "DELETE MY ACCOUNT" exactly to confirm.');
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/user/delete-account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPhrase: phrase }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Deletion failed. Please try again.");
        setBusy(false);
        return;
      }
      window.location.href = "/auth";
    } catch {
      setError("Network error. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className="px-5 py-6 md:px-8 md:py-8 max-w-2xl">
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
        <div className="mb-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          <span className="text-sm font-bold text-destructive">Danger Zone</span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Permanently delete your account and every bit of data tied to it — clients,
          appointments, staff, payments, everything. This cannot be undone.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90"
          data-testid="delete-account-open"
        >
          <Trash2 className="h-4 w-4" />
          Delete my account
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/15">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Delete account permanently</h2>
                <p className="text-sm text-muted-foreground">This cannot be undone.</p>
              </div>
              <button
                onClick={() => { setOpen(false); setPhrase(""); setError(""); }}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 space-y-1 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              <p className="font-semibold">The following will be permanently deleted:</p>
              <ul className="list-inside list-disc space-y-0.5">
                <li>Your store and all business settings</li>
                <li>All client records and appointment history</li>
                <li>All staff, payments, and financial data</li>
                <li>All SMS, email, and communication history</li>
                <li>Your login and account credentials</li>
              </ul>
            </div>

            <p className="mb-3 text-sm text-muted-foreground">
              Type <span className="font-mono font-bold text-foreground">DELETE MY ACCOUNT</span> to confirm:
            </p>
            <input
              type="text"
              value={phrase}
              onChange={(e) => { setPhrase(e.target.value); setError(""); }}
              placeholder="DELETE MY ACCOUNT"
              autoFocus
              className="mb-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-destructive"
            />
            {error && <p className="mb-3 text-xs text-destructive">{error}</p>}

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => { setOpen(false); setPhrase(""); setError(""); }}
                className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={doDelete}
                disabled={busy || phrase !== "DELETE MY ACCOUNT"}
                className="flex-1 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Deleting…" : "Delete everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
