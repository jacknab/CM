import { isNailSalonBiz } from "@/hooks/use-features";

const SELECTED_STORE_KEY = "certxa_selected_store_id";

type RouteUser = { staffId?: number | null } | null | undefined;
type RouteStore = { id: number; category?: string | null };

/** Resolve the account's landing page after authentication.
 * Nail-salon owners/managers go directly to the dedicated front-desk workspace;
 * staff accounts and every other business type keep the standard calendar home. */
export async function getDefaultAuthenticatedRoute(user?: RouteUser): Promise<"/nail" | "/calendar"> {
  if (user?.staffId) return "/calendar";

  try {
    const response = await fetch("/api/stores", { credentials: "include" });
    if (!response.ok) return "/calendar";

    const stores = await response.json() as RouteStore[];
    const savedId = Number(localStorage.getItem(SELECTED_STORE_KEY));
    const selectedStore = stores.find((store) => Number.isFinite(savedId) && store.id === savedId) ?? stores[0];
    return isNailSalonBiz(selectedStore?.category) ? "/nail" : "/calendar";
  } catch {
    return "/calendar";
  }
}
