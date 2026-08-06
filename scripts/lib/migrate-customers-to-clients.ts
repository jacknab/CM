// Migration logic is now inlined in the /migrate-from-customers route handler in routes/clients.ts
// This file is kept as a stub so existing imports don't break.
export async function migrateCustomersToClients(_storeId: number): Promise<{ migrated: number }> {
  return { migrated: 0 };
}
