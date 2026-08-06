# Self-Building Websites

## Overview

The Self-Building Websites feature automatically generates static JSON data files for every published website in the Certxa booking system. When a salon publishes their website, it is automatically populated with their live data from SalonOS — no copy-pasting needed.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   SalonOS DB    │────▶│  Data Generator  │────▶│  JSON Files     │
│  (locations,    │     │  (cron/API)      │     │  (website-data/ │
│   services,     │     │                  │     │   slug.json)    │
│   staff, etc)   │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Website        │────▶│  API Cache       │────▶│  React Template │
│  Template       │     │  (in-memory,     │     │  (uses data to  │
│  (React app)    │     │   5 min TTL)     │     │   render pages) │
└─────────────────┘     └──────────────────┘     └─────────────────┘
```

## Components

### 1. Data Generator Script

**File:** `scripts/src/generate-website-data.ts`

Generates static JSON files for all published websites. Each file contains:
- Business information (name, address, phone, email, etc.)
- Opening hours
- Services and service categories
- Staff members
- Customer reviews (Google + internal)

**Usage:**
```bash
# Generate data for all published websites
pnpm --filter @workspace/scripts run generate-website-data

# Generate data for a specific website
pnpm --filter @workspace/scripts run generate-website-data -- --slug mysalon

# Output to a specific directory
pnpm --filter @workspace/scripts run generate-website-data -- --out ./my-data

# Preview what would be generated (dry run)
pnpm --filter @workspace/scripts run generate-website-data -- --dry-run --pretty
```

### 2. Cron Job Setup

**File:** `scripts/src/setup-cron.ts`

Sets up a cron job to automatically regenerate website data at regular intervals.

**Usage:**
```bash
# Install cron job (runs every 5 minutes by default)
pnpm --filter @workspace/scripts run setup-cron

# Custom interval (every 10 minutes)
pnpm --filter @workspace/scripts run setup-cron -- --interval 10

# Remove the cron job
pnpm --filter @workspace/scripts run setup-cron -- --remove
```

### 3. API Endpoints

#### Get Tenant Data (Cached)
```
GET /api/tenant/:slug/data
```
Returns business data for a website. Uses in-memory caching with 5-minute TTL.

**Response:**
```json
{
  "website": { "id": 1, "name": "My Salon", "slug": "mysalon" },
  "business": { "id": 42, "name": "My Salon", "address": "123 Main St", ... },
  "hours": [{ "day_of_week": 0, "open_time": "09:00", "close_time": "17:00", "is_closed": true }, ...],
  "services": [{ "id": 1, "name": "Haircut", "price": "50.00", "duration": 30, ... }, ...],
  "serviceCategories": [{ "id": 1, "name": "Hair Services" }, ...],
  "staff": [{ "id": 1, "name": "Jane Doe", "role": "Stylist", ... }, ...],
  "reviews": [{ "customer_name": "John", "rating": 5, "comment": "Great service!", ... }, ...]
}
```

#### Regenerate Single Website Cache
```
POST /api/tenant/:slug/data/regenerate
```
Invalidates and regenerates the cache for a specific website. Called automatically when a website is published.

#### Regenerate All Website Caches
```
POST /api/tenant/data/regenerate-all
```
Regenerates the cache for all published websites. Useful for bulk updates.

### 4. Shared Library

**File:** `artifacts/api-server/src/lib/tenant-data.ts`

Shared TypeScript library that provides:
- Type definitions for all data structures
- `buildTenantData()` - Generates data for a single location
- `getPublishedWebsites()` - Lists all published websites
- `getWebsiteBySlug()` - Looks up a website by slug
- `generateTenantDataFile()` - Creates a complete data file with metadata
- `generateAllTenantData()` - Generates data for all published websites

## Data Contract

The data structure matches the `useSiteData` hook in `template_master/src/hooks/useSiteData.ts`:

```typescript
interface SiteData {
  website: { id: number; name: string; slug: string };
  business: BusinessData | null;
  hours: HoursEntry[];
  services: ServiceEntry[];
  serviceCategories: CategoryEntry[];
  staff: StaffEntry[];
  reviews: ReviewEntry[];
}
```

## How It Works

1. **Website Publication**
   - When a website is published via `POST /api/websites/:id/publish`, the cache is automatically invalidated
   - The next request to `/api/tenant/:slug/data` will fetch fresh data and cache it

2. **Cron Job (Optional)**
   - Set up a cron job to pre-generate all website data files
   - This ensures data is always fresh and reduces database load
   - Recommended interval: every 5 minutes

3. **Template Rendering**
   - When a visitor accesses a published website, the React template loads
   - The `useSiteData()` hook fetches data from `/api/tenant/:slug/data`
   - The API returns cached data (or fresh data if cache expired)
   - The template renders with the salon's real data

## Configuration

### Cache TTL
The in-memory cache TTL is set to 5 minutes by default. To change it, modify `CACHE_TTL_MS` in `artifacts/api-server/src/routes/websites.ts`:

```typescript
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
```

### Cache Version
Bump `CACHE_VERSION` to invalidate all cached data (useful after schema changes):

```typescript
// In tenant-data.ts
export const CACHE_VERSION = 2; // Increment to invalidate all caches
```

### Output Directory
The default output directory for generated JSON files is `./website-data`. Change it with the `--out` flag:

```bash
pnpm --filter @workspace/scripts run generate-website-data -- --out /var/www/website-data
```

## Monitoring

### Check Cache Status
The API returns cache headers:
- `X-Cache: HIT` - Data served from cache
- `X-Cache: MISS` - Fresh data fetched from database

### Logs
Cron job logs are written to `logs/certxa-website-data.log`

### Manual Verification
```bash
# List current cron jobs
crontab -l | grep certxa

# Check generated files
ls -la ./website-data/

# View a specific website's data
cat ./website-data/mysalon.json | jq .
```

## Troubleshooting

### Data Not Updating
1. Check if the website is published: `SELECT * FROM wb_websites WHERE slug = 'mysalon';`
2. Verify the storeid is set and valid
3. Check the API logs for errors
4. Manually trigger regeneration: `POST /api/tenant/mysalon/data/regenerate`

### Cron Job Not Running
1. Verify cron is installed: `crontab -l`
2. Check cron logs: `grep CRON /var/log/syslog`
3. Ensure the project path is correct in the cron command
4. Test manually: `pnpm --filter @workspace/scripts run generate-website-data`

### Missing Data
The generator gracefully handles missing tables by returning empty arrays. If specific data is missing:
1. Verify the data exists in the database
2. Check that the store_id matches the website's storeid
3. Review the generator logs for warnings about failed queries
