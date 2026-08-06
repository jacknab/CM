const { db } = require('./artifacts/api-server/src/db');
const { storeSettings } = require('./artifacts/api-server/src/shared/schema');

async function checkAiReceptionistSettings() {
  try {
    const settings = await db
      .select({ 
        id: storeSettings.storeId, 
        preferences: storeSettings.preferences 
      })
      .from(storeSettings)
      .limit(10);

    console.log('Store Settings:');
    settings.forEach((setting) => {
      try {
        const prefs = JSON.parse(setting.preferences || '{}');
        console.log(`Store ${setting.id}:`);
        console.log('  AI Receptionist Enabled:', prefs.aiReceptionistEnabled);
      } catch (parseError) {
        console.error(`Error parsing preferences for store ${setting.id}:`, parseError);
      }
    });
  } catch (error) {
    console.error('Error fetching store settings:', error);
  }
}

checkAiReceptionistSettings();