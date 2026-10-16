import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { appAllowsPath, appFitsBusiness, appSettingsPathFor } from "@shared/appProfiles";
import { currentAppProfile } from "@/lib/appProfile";
import { useSelectedStore } from "@/hooks/use-store";
import { useAuth } from "@/hooks/use-auth";

/**
 * Inside one of the Certxa apps (shared/appProfiles.ts), a screen the app doesn't include goes to the
 * app's home screen, so a tap never lands in the full Certxa platform. Does nothing in the full web app.
 */
export function AppScreenGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const profile = currentAppProfile();
  if (profile && !appAllowsPath(profile, pathname)) {
    // A link to a settings section the app has (/settings/hours) opens the app's copy of it.
    return <Navigate to={appSettingsPathFor(profile, pathname) ?? profile.home} replace />;
  }
  return <>{children}</>;
}

/**
 * Inside an app, a signed-in business of another type (a hair salon in the nail app) is told so instead
 * of being shown screens that aren't meant for it.
 */
export function AppBusinessGate({ children }: { children: ReactNode }) {
  const profile = currentAppProfile();
  const { selectedStore } = useSelectedStore();
  const { logoutAsync } = useAuth();
  if (!profile || !selectedStore || appFitsBusiness(profile, (selectedStore as any).category)) return <>{children}</>;
  const signOut = async () => {
    await logoutAsync().catch(() => {});
    window.location.href = "/app-login";
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6" data-testid="app-wrong-business">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{profile.name} is for {profile.audience}</h1>
        <p className="mt-3 text-muted-foreground">
          {selectedStore.name} is set up as a {String((selectedStore as any).category ?? "different kind of business").toLowerCase()}.
          Use the Certxa app for your business, or sign in with a {profile.audience.replace(/s$/, "")} account.
        </p>
        <button onClick={() => void signOut()} className="mt-6 rounded-full bg-foreground px-6 py-3 text-sm font-semibold text-background">
          Sign out
        </button>
      </div>
    </main>
  );
}
