---
name: Template preview live data
description: Website Builder template previews must consistently use the authenticated salon's live tenant data.
---

Website Builder previews must resolve salon context from the server before creating the iframe URL. For website-backed previews, inject the complete shared tenant payload in the document head before the template bundle mounts; for store-only previews, use the same `buildTenantData()` contract. Never fall back to a raw template URL when context is unavailable.

**Why:** Reading session storage raced the builder context request, and injecting only a slug left a timing window where templates rendered hardcoded demo data. Multi-store/admin sessions could also select the wrong website.

**How to apply:** Keep preview and published-site data on the shared `TenantData` contract, select the website matching the server-confirmed store ID, and place the fetch interception/data bridge before `</head>`.