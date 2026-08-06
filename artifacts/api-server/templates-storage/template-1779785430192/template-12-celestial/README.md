# Template 12: Celestial

A premium nail salon website template. This is a fully self-contained React + Vite application.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build for Production

```bash
npm run build
```

Output goes to the `dist/` folder.

## Customizing Business Data

Edit the `PLACEHOLDER` object in `src/lib/data.ts` to update the demo business name, address, phone number, services, staff, hours, and reviews.

### Live API Data (Optional)

This template can fetch live data from your API automatically. Before your page loads, set:

```html
<script>
  window.__CERTXA_SLUG__ = 'your-salon-slug';
  window.__CERTXA_API_BASE__ = 'https://your-api.com';
</script>
```

The template will then fetch from `/api/tenant/{slug}/data` and override the placeholder. Falls back to placeholder data on any error.

## Tech Stack

- React 18
- TypeScript 5
- Vite 6
