import 'dotenv/config';
import pg from 'pg';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pg-core';
import * as schema from '@shared/schema';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
});

const db = drizzle(pool, { schema });

async function checkAiReceptionistSettings() {
  try {
    console.log('Checking AI Receptionist Settings...');
    console.log('OpenAI API Key Present:', !!process.env.AI_INTEGRATIONS_OPENAI_API_KEY);
    console.log('Twilio Account SID Present:', !!process.env.TWILIO_ACCOUNT_SID);
    console.log('App URL:', process.env.APP_URL);

    const settings = await db
      .select({ 
        id: schema.storeSettings.storeId, 
        preferences: schema.storeSettings.preferences 
      })
      .from(schema.storeSettings)
      .limit(10);

    console.log('\nStore Settings:');
    if (settings.length === 0) {
      console.log('No store settings found.');
      return;
    }

    settings.forEach((setting) => {
      try {
        const prefs = JSON.parse(setting.preferences || '{}');
        console.log(`Store ${setting.id}:`);
        console.log('  Preferences Raw:', setting.preferences);
        console.log('  AI Receptionist Enabled:', prefs.aiReceptionistEnabled);
      } catch (parseError) {
        console.error(`Error parsing preferences for store ${setting.id}:`, parseError);
      }
    });
  } catch (error) {
    console.error('Error fetching store settings:', error);
  } finally {
    await pool.end();
  }
}

checkAiReceptionistSettings()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });