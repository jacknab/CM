import { useMemo, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { ChevronLeft, ArrowUpRight, AlertTriangle, Trash2, X } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLanguage } from "@/hooks/use-language";
import { useFeatureFlags } from "@/hooks/use-features";
import { cn } from "@/lib/utils";
import { buildSettingsNav, type SettingsTab, type SettingsNavItem } from "@/lib/settings-nav";
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
import ClientNotifications from "@/pages/settings/ClientNotifications";
import TranslationsPage from "@/pages/TranslationsPage";
import DataTransferPage from "@/pages/DataTransferPage";
import FeaturesSettings from "@/pages/FeaturesSettings";
import CalendarSyncSettings from "@/pages/CalendarSyncSettings";
import PersonalDetailsPage from "@/pages/settings/PersonalDetailsPage";
import MyPreferencesPage from "@/pages/settings/MyPreferencesPage";
import SecurityPage from "@/pages/settings/SecurityPage";

// slug → pane component. Every inline settings destination lives here; the nav
// (settings-nav.ts) decides which appear in the rail and under which tab.
const PANES: Record<string, React.ComponentType> = {
  "personal-details": PersonalDetailsPage,
  "my-preferences": MyPreferencesPage,
  "security": SecurityPage,
  "business": BusinessSettings,
  "hours": BusinessHoursPage,
  "online-booking": OnlineBooking,
  "booking-controls": CalendarSettings,
  "resources": ResourceSettings,
  "kiosk": KioskSettings,
  "client-notifications": ClientNotifications,
  "pos": POSSettings,
  "payout-account": PayoutAccountSettings,
  "language": LanguageSettings,
  "translations": TranslationsPage,
  "advanced": FeaturesSettings,
  "data-transfer": DataTransferPage,
  "commission": PayrollSettings,
  "calendar-sync": CalendarSyncSettings,
};

// Retired slugs from the short-lived hub layout — redirect to a live destination.
const ALIASES: Record<string, string> = {
  booking: "booking-controls",
  messaging: "client-notifications",
  sms: "client-notifications",
  email: "client-notifications",
  "booking-hub": "booking-controls",
  account: "personal-details",
};

const DEFAULT_SLUG = "business";

// Legacy panes that still render their own page <h1> (not yet reworked with the
// useInSettingsShell() guard). Suppress the shell's own section title for these
// so it isn't stacked on top of the page's. Remove a slug once its page is
// reworked to hide its header inside the shell.
const SELF_TITLED = new Set([
  "online-booking",
  "booking-controls",
  "resources",
  "kiosk",
  "pos",
  "payout-account",
  "language",
  "translations",
  "advanced",
  "data-transfer",
  "commission",
]);

export default function SettingsShell() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const features = useFeatureFlags();
  const { pick } = useLanguage();
  // Mobile-only: which tab's list the rail shows on the /settings screen
  // (no section). Desktop derives the active tab from the URL instead.
  const [mobileTabKey, setMobileTabKey] = useState<string | null>(null);

  const t = {
    title:       pick({ en: "Settings",       vi: "Cài đặt",       es: "Ajustes",          fr: "Paramètres" }),
    back:        pick({ en: "Settings",       vi: "Cài đặt",       es: "Ajustes",          fr: "Paramètres" }),
    deleteLabel: pick({ en: "Delete Account", vi: "Xóa tài khoản", es: "Eliminar cuenta",  fr: "Supprimer le compte" }),
  };

  const tabs = useMemo(
    () =>
      buildSettingsNav(pick)
        .map((tab) => ({
          ...tab,
          items: tab.items.filter((it) => !(it.requiresPos && !features.pos)),
        }))
        .filter((tab) => tab.items.length > 0),
    [pick, features.pos],
  );

  const allItems = useMemo(() => tabs.flatMap((tab) => tab.items), [tabs]);

  // ── routing guards ────────────────────────────────────────────────────────
  if (!section) {
    const isWide = typeof window !== "undefined" && window.innerWidth >= 768;
    if (isWide) return <Navigate to={`/settings/${DEFAULT_SLUG}`} replace />;
  } else if (ALIASES[section]) {
    return <Navigate to={`/settings/${ALIASES[section]}`} replace />;
  } else if (section !== "delete-account" && !PANES[section]) {
    // Unknown slug — usually an external item's slug. Bounce to its real route.
    const ext = allItems.find((i) => i.slug === section);
    return <Navigate to={ext ? ext.to : `/settings/${DEFAULT_SLUG}`} replace />;
  }

  const activeSlug = section ?? null;
  const activeItem = allItems.find((i) => i.slug === activeSlug) ?? null;

  // The tab whose rail is shown. Normally derived from the active section; on the
  // mobile rail screen (no section) it's a local pick (mobileTabKey) so tapping a
  // tab reveals its list instead of jumping straight into the first page.
  const sectionTab = tabs.find((tab) => tab.items.some((i) => i.slug === activeSlug)) ?? null;
  const activeTab: SettingsTab | null =
    sectionTab ??
    (isMobile && !section ? tabs.find((tab) => tab.key === mobileTabKey) ?? tabs[0] : tabs[0]) ??
    null;
  const Pane = activeSlug && activeSlug !== "delete-account" ? PANES[activeSlug] : null;

  const goToItem = (it: SettingsNavItem) => {
    if (it.external) navigate(it.to);
    else navigate(`/settings/${it.slug}`);
  };

  const goToTab = (tab: SettingsTab) => {
    // Mobile rail screen: just switch which list is shown.
    if (isMobile && !section) {
      setMobileTabKey(tab.key);
      return;
    }
    const target = tab.items.find((i) => !i.external) ?? tab.items[0];
    if (!target) return;
    if (target.external) navigate(target.to);
    else navigate(`/settings/${target.slug}`);
  };

  // ── top tab bar (underline style, à la GlossGenius) ──────────────────────
  const TabBar = (
    <div className="flex shrink-0 gap-7 overflow-x-auto border-b border-border px-4 md:px-8">
      {tabs.map((tab) => {
        const active = tab.key === activeTab?.key;
        return (
          <button
            key={tab.key}
            onClick={() => goToTab(tab)}
            data-testid={`settings-tab-${tab.key}`}
            className={cn(
              "-mb-px shrink-0 border-b-2 py-4 text-[16px] font-semibold transition-colors",
              active
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  // ── left rail (active tab's items) ───────────────────────────────────────
  const railItems = activeTab?.items ?? [];

  const Rail = (
    <nav
      className={cn(
        "flex flex-col gap-0.5 overflow-y-auto scrollbar-none",
        isMobile ? "flex-1 px-3 pb-24 pt-4" : "w-[240px] shrink-0 px-3 py-6",
      )}
    >
      {railItems.map((it) => {
        const active = it.slug === activeSlug;
        return (
          <button
            key={it.slug}
            onClick={() => goToItem(it)}
            title={it.description}
            data-testid={`settings-nav-${it.slug}`}
            className={cn(
              "group flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className="flex-1 truncate">{it.label}</span>
            {it.badge && (
              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                {it.badge}
              </span>
            )}
            {it.external && (
              <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70 opacity-0 transition-opacity group-hover:opacity-100" />
            )}
          </button>
        );
      })}

      {activeTab?.key === "personal" && (
        <button
          onClick={() => navigate("/settings/delete-account")}
          data-testid="settings-nav-delete-account"
          className={cn(
            "mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[15px] font-semibold transition-colors",
            activeSlug === "delete-account"
              ? "bg-destructive/10 text-destructive"
              : "text-destructive/80 hover:bg-destructive/10",
          )}
        >
          <span className="flex-1 truncate">{t.deleteLabel}</span>
        </button>
      )}
    </nav>
  );

  // ── detail pane ──────────────────────────────────────────────────────────
  const Detail = (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      {isMobile && (
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <button
            onClick={() => navigate("/settings")}
            className="-ml-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-primary hover:bg-muted"
            data-testid="settings-back"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.back}
          </button>
          <h1 className="truncate text-lg font-semibold text-foreground" data-testid="settings-section-title">
            {activeSlug === "delete-account" ? t.deleteLabel : activeItem?.label ?? t.title}
          </h1>
        </header>
      )}

      <div className="flex-1 overflow-y-auto">
        {!isMobile && !SELF_TITLED.has(activeSlug ?? "") && (
          <div className="mx-auto max-w-2xl px-4 pt-8 md:px-8">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground" data-testid="settings-section-title">
              {activeSlug === "delete-account" ? t.deleteLabel : activeItem?.label ?? t.title}
            </h1>
            {activeItem?.description && (
              <p className="mt-1 text-sm text-muted-foreground">{activeItem.description}</p>
            )}
          </div>
        )}
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
        <div className="settings-surface flex h-full min-h-0 flex-col">
          {section ? (
            Detail
          ) : (
            <>
              <header className="border-b border-border px-4 pb-4 pt-5">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">{t.title}</h1>
              </header>
              {TabBar}
              {Rail}
            </>
          )}
        </div>
      ) : (
        <div className="settings-surface flex h-full min-h-0 flex-col">
          <div className="shrink-0 px-4 pb-5 pt-9 md:px-8 md:pb-6 md:pt-11">
            <h1 className="text-[28px] font-bold leading-none tracking-tight text-foreground">{t.title}</h1>
          </div>
          {TabBar}
          <div className="flex min-h-0 flex-1">
            {Rail}
            {Detail}
          </div>
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
