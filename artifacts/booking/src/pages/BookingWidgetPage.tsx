import { useSelectedStore } from "@/hooks/use-store";
import { Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import type { StoreData } from "./public-booking/types";
import BookingWidget from "./public-booking/BookingWidget";

/**
 * BookingWidgetPage - Minimal page for embedding booking widget on external websites
 * 
 * Access via: /widget?slug=YOUR_STORE_SLUG
 * 
 * Perfect for iframe embedding:
 * <iframe src="https://yourdomain.com/widget?slug=store-slug"></iframe>
 */
export default function BookingWidgetPage() {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const slug = params.get("slug");

  const { selectedStore: store, isLoading: storeLoading } = useSelectedStore();

  // If accessed via subdomain (no slug in query), fetch store from subdomain endpoint
  const { data: subdomainStore, isLoading: subdomainLoading } = useQuery<StoreData>({
    queryKey: ["/api/store/by-subdomain"],
    enabled: !slug, // Only fetch if no slug parameter
  });

  // Use slug-based store or subdomain store
  const effectiveStore = slug ? store : (subdomainStore || store);
  const isLoading = slug ? storeLoading : subdomainLoading;

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!effectiveStore) {
    return (
      <div className="w-full h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Store not found</h2>
          <p className="text-gray-500 mt-2">This booking widget doesn't exist.</p>
          {!slug && <p className="text-xs text-gray-400 mt-4">Hint: Add ?slug=YOUR_STORE_SLUG to the URL</p>}
        </div>
      </div>
    );
  }

  const effectiveSlug = slug || effectiveStore.bookingSlug;

  return (
    <div className="min-h-screen bg-white">
      <BookingWidget store={effectiveStore as StoreData} slug={effectiveSlug!} />
    </div>
  );
}
