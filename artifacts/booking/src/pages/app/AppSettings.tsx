/**
 * A Certxa app's own Settings (plans/certxa-apps.md): the sections its profile lists (shared/appProfiles.ts),
 * each opening the existing Certxa page for it — no setting exists twice. Sections that live in the full
 * Settings shell open here under /app/settings/<slug>, without the shell's list of every setting.
 */
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { APP_SETTINGS_SECTIONS } from "@shared/appProfiles";
import { currentAppProfile } from "@/lib/appProfile";
import { SETTINGS_PANES } from "@/pages/settings/panes";

export default function AppSettings() {
  const navigate = useNavigate();
  const profile = currentAppProfile();
  // Outside an app this page has nothing to show: the full web app has its own Settings.
  if (!profile) return <Navigate to="/settings" replace />;
  const sections = profile.settings.map((key) => ({ key, ...APP_SETTINGS_SECTIONS[key] })).filter((s) => s.to);
  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <div className="mt-6 divide-y divide-border rounded-xl border border-border bg-card">
          {sections.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => navigate(s.to)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              data-testid={`app-settings-${s.key}`}
            >
              <div>
                <p className="text-[15px] font-medium">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}

/** One of the Settings shell's sections, opened on its own inside an app. Only the profile's sections open. */
export function AppSettingsSection() {
  const { section = "" } = useParams<{ section: string }>();
  const profile = currentAppProfile();
  if (!profile) return <Navigate to={`/settings/${section}`} replace />;
  const allowed = profile.settings.some((key) => APP_SETTINGS_SECTIONS[key]?.to === `/app/settings/${section}`);
  const Pane = allowed ? SETTINGS_PANES[section] : undefined;
  if (!Pane) return <Navigate to="/app/settings" replace />;
  return <Pane />;
}
