import 'dotenv/config';
import { db } from './artifacts/api-server/src/db.js';
import { locations, storeSettings } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function enableAiReceptionistForAllStores() {
  try {
    // Fetch all store IDs
    const stores = await db
      .select({ id: locations.id })
      .from(locations);
    
    console.log(`Found ${stores.length} stores`);
    
    for (const store of stores) {
      // Fetch existing settings
      const [existingSettings] = await db
        .select({ preferences: storeSettings.preferences })
        .from(storeSettings)
        .where(eq(storeSettings.storeId, store.id))
        .limit(1);
      
      // Parse or initialize preferences
      let preferences = {};
      if (existingSettings?.preferences) {
        try {
          preferences = JSON.parse(existingSettings.preferences);
        } catch (parseError) {
          console.error(`Error parsing preferences for store ${store.id}:`, parseError);
        }
      }
      
      // Enable AI Receptionist
      preferences.aiReceptionistEnabled = true;
      
      // Upsert store settings
      if (existingSettings) {
        await db
          .update(storeSettings)
          .set({ preferences: JSON.stringify(preferences) })
          .where(eq(storeSettings.storeId, store.id));
      } else {
        await db
          .insert(storeSettings)
          .values({ 
            storeId: store.id, 
            preferences: JSON.stringify(preferences) 
          });
      }
      
      console.log(`Enabled AI Receptionist for store ${store.id}`);
    }
    
    console.log('AI Receptionist enabled for all stores');
  } catch (error) {
    console.error('Error enabling AI Receptionist:', error);
  }
}

enableAiReceptionistForAllStores()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });