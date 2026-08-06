---
name: Template Google Maps embeds
description: Google map embeds in catalogued templates should use the dedicated embed endpoint and include a direct Maps fallback.
---

Use `https://www.google.com/maps/embed?output=embed&q=...` for template iframe maps instead of the older `maps?q=...&output=embed` URL. Include a `maps/search/?api=1&query=...` link beneath the iframe.

**Why:** The legacy URL can return a blank or blocked embedded page even when it appears valid, while the dedicated embed endpoint returned a working map document during template preview verification.

**How to apply:** Build the query from the live business address with a safe fallback, encode it, use the dedicated embed URL, and preserve the direct-link fallback for browsers or privacy settings that block third-party iframes.