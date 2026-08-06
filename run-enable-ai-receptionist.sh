#!/bin/bash
cd /apps/CM
source .env

# Function to update store settings
update_store_settings() {
    local store_id="$1"
    
    # Fetch existing preferences
    preferences=$(psql "$DATABASE_URL" -t -c "
        SELECT preferences FROM store_settings WHERE store_id = $store_id;
    ")
    
    # If preferences is empty or null, start with an empty JSON object
    if [[ -z "$preferences" || "$preferences" == "null" ]]; then
        preferences="{}"
    fi
    
    # Parse existing preferences and add aiReceptionistEnabled
    updated_preferences=$(echo "$preferences" | jq '. + {"aiReceptionistEnabled": true}')
    
    # Upsert store settings
    psql "$DATABASE_URL" -c "
        INSERT INTO store_settings (store_id, preferences) 
        VALUES ($store_id, '$updated_preferences') 
        ON CONFLICT (store_id) 
        DO UPDATE SET preferences = '$updated_preferences';
    "
    
    echo "Enabled AI Receptionist for store $store_id"
}

# Fetch all store IDs
store_ids=$(psql "$DATABASE_URL" -t -c "SELECT id FROM locations;")

# Iterate through store IDs and update settings
for store_id in $store_ids; do
    update_store_settings "$store_id"
done

echo "AI Receptionist enabled for all stores"