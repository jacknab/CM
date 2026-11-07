import { isNailSalonBiz } from "@/hooks/use-features";
import { currentAppProfile } from "@/lib/appProfile";
import { isProAccount } from "@shared/proAccount";
import { isSoloPlanCode } from "@shared/soloPlan";

const SELECTED_STORE_KEY = "certxa_selected_store_id";

type RouteUser = { staffId?: number | null; role?: string | null; accountType?: string | null } | null | undefined;
type RouteStore = { id: number; category?: string | null };

/** Resolve the account's landing page after authentication.
 * Nail-salon owners/managers go directly to the dedicated front-desk workspace;
 * staff accounts and every other business type keep the standard calendar home. */
export async function getDefaultAuthenticatedRoute(user?: RouteUser): Promise<string> {
  // Inside a Certxa app everyone lands on the app's home screen (shared/appProfiles.ts).
  const app = currentAppProfile();
  if (app) return app.home;

  // A Certxa Pro (Solo) account has its own dashboard on the website (plans/solo-web-dashboard.md).
  if (isProAccount(user?.accountType)) return "/solo";

  // A technician's own login. An owner or manager whose account is also linked to a staff record (they work
  // on clients too) still has a staffId, and is not a technician login: they go to the salon's workspace.
  if (user?.role === "staff" || (user?.staffId && !user?.role)) return "/calendar";

  try {
    const response = await fetch("/api/stores", { credentials: "include" });
    if (!response.ok) return "/calendar";

    const stores = await response.json() as RouteStore[];
    const savedId = Number(localStorage.getItem(SELECTED_STORE_KEY));
    const selectedStore = stores.find((store) => Number.isFinite(savedId) && store.id === savedId) ?? stores[0];
    // A business on the Solo or Plus plan uses the Solo dashboard too.
    if (selectedStore?.id && user?.role !== "staff") {
      const features = await fetch(`/api/plans/my-features?storeId=${selectedStore.id}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (isSoloPlanCode(features?.planCode)) return "/solo";
    }
    return isNailSalonBiz(selectedStore?.category) ? "/nail" : "/calendar";
  } catch {
    return "/calendar";
  }
}
