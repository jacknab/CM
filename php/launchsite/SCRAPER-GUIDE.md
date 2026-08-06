# Launchit — URL Scraper / Template Importer Guide

The scraper tool was fully built and is ready to use. It lets you point it at any live website URL and turn that page into a template in the Launchit catalog — no manual file editing required.

---

## What it does

When you give it a URL, it:

1. Downloads the full HTML of the page
2. Downloads every linked CSS file and rewrites all paths inside them
3. Downloads every JavaScript file
4. Downloads every image (including lazy-loaded ones using `data-src`)
5. Downloads every font file referenced inside CSS
6. Downloads favicons and touch icons
7. Rewrites all asset paths in the HTML so the page loads self-contained (no external dependencies)
8. Injects a `<base>` fallback tag so anything it couldn't capture still resolves correctly
9. Saves everything to a temporary staging folder so you can preview it before committing
10. Lets you review it in a live iframe preview, fill in metadata, then save it as a named template

**Size limit:** 25 MB total per scrape session (enough for any typical salon/barbershop site).

---

## How to access it

Go to your admin panel:

```
https://certxa.com/launchsite/admin.php
```

Log in, then either:
- Click the **"🌐 Import from URL"** button at the top of the page, or
- Scroll down to the **"Import from URL"** card

---

## Step-by-step: importing a new template

### Step 1 — Enter the URL

Paste the full URL of the website you want to import. Examples:

```
https://example-salon.com
https://www.some-barbershop.com/
```

- You don't need to include `https://` — it'll be added automatically if missing
- Only the **homepage** is downloaded (it does not crawl inner pages)
- The site must be publicly accessible — pages behind login, Cloudflare bot protection, or paywalls cannot be scraped

Click **"🌐 Fetch & Preview"** and wait. It typically takes 5–20 seconds depending on how many assets the site has.

### Step 2 — Review the preview

Once fetching is complete, a live **iframe preview** appears showing the page exactly as it was captured. Scroll through it to confirm it looks right.

You'll also see:
- The page title detected from the `<title>` tag
- The source URL
- How many KB were downloaded and how many assets were captured

If the preview looks broken or wrong, click **"Start over"** and try a different URL.

### Step 3 — Fill in the template details

A form appears below the preview with these fields:

| Field | Description |
|---|---|
| **Template Name** | The display name shown in the catalog (e.g. "Modern Cuts Barbershop"). Auto-filled from the page title — edit it to something clean. |
| **Category** | Choose from: Hair Salon, Barbershop, or Nail Salon |
| **Template ID** | A URL-safe slug (e.g. `modern-cuts`). Auto-generated from the name. Must be unique — you'll get an error if it's already taken. |
| **Style** | A short label for the design style (e.g. "Modern", "Classic", "Dark"). Defaults to "Scraped". |
| **Badge** | Optional badge shown on the catalog card: `new`, `popular`, `premium`, or blank |

### Step 4 — Save

Click **"✅ Save as Template"**.

The scraper will:
- Move the downloaded files from the staging folder into `templates/{template-id}/`
- Register a new entry in `data/templates.php` automatically
- Redirect you back to the admin panel with a success message

The template is now live in the catalog immediately.

---

## After saving — upload a thumbnail

The catalog card will show a placeholder until you upload a thumbnail. To add one:

1. In the admin panel, find the template in the table
2. Click **"Upload Thumb"** next to it
3. Upload a JPG or PNG (recommended: 800×500px, screenshot of the site)

---

## Re-scraping an existing template

If the original website has been updated and you want to refresh the template files:

1. In the admin panel, find the template in the table (only works for templates that were imported via the scraper — not hand-built ones)
2. Click **"Re-scrape"** next to it
3. Confirm the prompt — it will re-download the original source URL and replace all stored files
4. The template ID and catalog entry stay the same; only the HTML/CSS/JS/images are refreshed

---

## Temporary session cleanup

Every scrape creates a temporary staging folder in `scraped-tmp/`. If you fetch a preview but don't save it (or start over), the temp files stay on disk. The system automatically cleans up sessions older than 24 hours, running the cleanup at most once per hour in the background.

You can also trigger a manual cleanup from the admin panel at any time — look for the **"🗑 Clear old sessions"** button in the scraper card header.

---

## What the scraper cannot capture

Some pages will not scrape successfully. Common reasons:

| Problem | Why it fails |
|---|---|
| Cloudflare protection or bot detection | The server blocks automated requests |
| Login-gated pages | The scraper has no session/cookie |
| JavaScript-rendered content (React/Vue SPAs) | Only the initial HTML is fetched — dynamic content rendered by JS won't appear |
| Sites that return 403/404/5xx | The server refuses or errors |
| Private/internal IP addresses | Blocked by the security check to prevent SSRF attacks |

If a site uses a framework like React or Next.js, the scrape may return a nearly-empty page. In that case the template will need to be built manually.

---

## File structure of a scraped template

After saving, the template lives at:

```
php/launchsite/templates/{template-id}/
├── index.html          # Full page with all paths rewritten to local assets
├── meta.json           # Scrape metadata (source URL, date, asset count, size)
└── assets/
    ├── css/            # All downloaded stylesheet files
    ├── js/             # All downloaded script files
    ├── img/            # All downloaded images
    └── fonts/          # All downloaded font files (woff, woff2, ttf, etc.)
```

---

## Where templates are registered

The catalog registry is a single PHP file:

```
php/launchsite/data/templates.php
```

Each scraped template is automatically appended to the `$all_templates` array here when you save it through the admin. You can manually edit this file if you need to update the description, badge, style label, or any other metadata after the fact.

---

## Deploying to your VPS

After importing templates through the admin, push the following to your server:

```
php/launchsite/data/templates.php   ← updated registry
php/launchsite/templates/           ← new template folder(s) inside here
```

The scraper itself (`admin-scraper.php`, `admin-scraper-save.php`, etc.) only needs to be deployed once — it's already part of the launchsite codebase.
