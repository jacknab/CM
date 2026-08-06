# CertXA Template Master

The canonical starting point for all CertXA website templates.
Copy this folder when creating a new salon website template — it already has the data-fetching wired up.

---

## What this template does

When a customer's website is served, the CertXA platform:

1. Injects `window.__CERTXA_SLUG__` into the page `<head>` (the website's subdomain slug)
2. The `useSiteData` hook fetches `GET /api/tenant/{slug}/data` from the platform API
3. All components read from `SiteContext` and render real business data automatically
4. If no `storeid` is linked, every component falls back to beautiful placeholder content

---

## Data contract

The `GET /api/tenant/:slug/data` endpoint returns:

```json
{
  "website":  { "id": 1, "name": "My Salon", "slug": "mysalon" },
  "business": {
    "name": "My Salon",
    "address": "123 Main St",
    "phone": "(555) 123-4567",
    "email": "hello@mysalon.com",
    "city": "Denver",
    "state": "CO",
    "postcode": "80202",
    "booking_slug": "mysalon",
    "category": "nail_salon"
  },
  "hours": [
    { "day_of_week": 1, "open_time": "09:00", "close_time": "19:30", "is_closed": false }
  ],
  "services": [
    { "id": 1, "name": "Classic Manicure", "price": "25.00", "duration": 30, "category_id": 1 }
  ],
  "serviceCategories": [
    { "id": 1, "name": "Manicures" }
  ],
  "staff": [
    { "id": 1, "name": "Jane Smith", "role": "Senior Technician", "avatar_url": null, "bio": null }
  ],
  "reviews": [
    { "customer_name": "Alice B.", "rating": 5, "comment": "Amazing!", "created_at": "2025-01-15T10:00:00Z" }
  ]
}
```

### Platform DB tables queried (read-only)

| Table               | Used for                           | Key column     |
|---------------------|------------------------------------|----------------|
| `locations`         | Business name, address, phone, etc | `id`           |
| `business_hours`    | Opening hours per day of week      | `store_id`     |
| `service_categories`| Service group names                | `store_id`     |
| `services`          | Service names + prices             | `store_id`     |
| `staff`             | Team members                       | `store_id`     |
| `google_reviews`    | Google review content              | `store_id`     |
| `reviews`           | Fallback review table              | `store_id`     |

All queries are wrapped in `try/catch` — if a table doesn't exist in the environment, an empty array is returned gracefully.

### `business.category` values

| Value        | Display label       |
|--------------|---------------------|
| `nail_salon` | Nail Salon & Spa    |
| `barbershop` | Barbershop          |
| `hair_salon` | Hair Salon & Spa    |

### `business.booking_slug`

When set, all "Book Now" buttons link to:
`https://app.certxa.com/book/{booking_slug}`

When not set, buttons link to `#contact` (the footer section).

---

## File structure

```
template_master/
├── src/
│   ├── context/
│   │   └── SiteContext.ts      ← React context + useSite() hook
│   ├── hooks/
│   │   └── useSiteData.ts      ← fetch /api/tenant/:slug/data, type definitions
│   ├── components/
│   │   ├── Navbar.tsx           ← business name, category, booking URL
│   │   ├── Hero.tsx             ← city, business name, booking URL
│   │   ├── Intro.tsx            ← story, hours summary, rating, phone CTA
│   │   ├── Services.tsx         ← live service categories + prices (3-col grid)
│   │   ├── Gallery.tsx          ← photo grid (Pexels; update URLs per category)
│   │   ├── Reviews.tsx          ← Google-style review carousel
│   │   └── Footer.tsx           ← hours list, address, phone, booking CTA
│   ├── App.tsx                  ← wraps everything in SiteContext.Provider
│   ├── index.css                ← Tailwind base + custom utility classes
│   └── main.tsx                 ← React root
├── index.html
├── package.json
├── tailwind.config.js           ← custom color palette (gold, charcoal, cream)
├── vite.config.ts
└── dist/                        ← pre-built output (ready to screenshot)
```

---

## How to create a new template from this master

1. Copy this folder:
   ```bash
   cp -r template_master/ my-new-template/
   ```

2. Customise the visual design (colors, fonts, layout, images)
   — data fetching is already wired; you only change how it _looks_

3. Update `tailwind.config.js` if you add new colors

4. Build it:
   ```bash
   cd my-new-template && npm install && npm run build
   ```

5. Zip the folder (without `node_modules` and `dist`):
   ```bash
   cd my-new-template && zip -r ../my-new-template.zip . -x "node_modules/*" -x "dist/*"
   ```

6. Import the ZIP through the CertXA Template Library → the platform will build it and screenshot it automatically

---

## Adding a store to a website

To connect a website to real business data, set its `storeid` in `wb_websites`:

```sql
UPDATE wb_websites SET storeid = '42' WHERE slug = 'my-salon-slug';
```

Replace `42` with the `locations.id` value from your platform DB.
Once set, all data populates automatically on next page load — no rebuild needed.
