---
name: Service image media separation
description: Rules for selecting service-card images from Google reviews and customer uploads.
---

Service-card image selection must keep reviewer identity separate from customer-result media. A Google profile avatar, initials fallback, or generic placeholder can never be used as a service hero image. Google review media is valid only when it contains an actual uploaded result photo; otherwise the card uses the normal service-image fallback and omits the featured review block.

**Why:** Reviewer avatars identify the person who left a review, while review media showcases the service result. Conflating them makes a service card look like a social profile and misrepresents the salon’s work.

**How to apply:** Keep `reviewerAvatarUrl` as avatar-only metadata. Treat only validated review-media URLs or customer-uploaded service photos as customer-result images, and apply the same rule in API matching, live templates, and server-rendered publishing.