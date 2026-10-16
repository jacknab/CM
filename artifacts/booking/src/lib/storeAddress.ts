/**
 * The address line a booking page shows. A business that keeps its address private (Solo plan) comes from
 * the server with no street address and `addressHidden` set (api-server lib/publicStore.ts): the page shows
 * its city and that the address comes with the booking. Directions and maps stay hidden for it.
 */
export function storeAddressLine(store: { address?: string | null; city?: string | null; state?: string | null; addressHidden?: boolean } | null | undefined): string | null {
  if (!store) return null;
  if (store.address) return store.address;
  if (!store.addressHidden) return null;
  const cityState = [store.city, store.state].filter(Boolean).join(", ");
  return cityState ? `${cityState} · Address sent after you book` : "Address sent after you book";
}
