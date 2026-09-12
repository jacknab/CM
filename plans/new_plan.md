# Certxa HTML-First Salon Website Upgrade

You are working on the existing Certxa production codebase.

## IMPORTANT — READ THIS FIRST

This is an existing production SaaS. Do NOT rewrite the application, replace major systems, or create a new architecture from scratch.

The goal is to evolve the existing salon website system into an **HTML-first, server-rendered, SEO/GEO-friendly salon website platform**, using the existing `publisherType = "auto"` implementation as the foundation.

Before making changes:

1. Inspect the existing implementation.
2. Confirm the relevant files and request flow.
3. Produce a concise implementation plan.
4. Do not make destructive changes.
5. Preserve existing functionality unless specifically changed below.

Do NOT start coding until you have completed the inspection and understand the existing architecture.

---

# PRIMARY GOAL

Every Certxa salon website should ultimately behave like a real, crawlable website.

Example:

`https://bellanails.certxa.com/`

The initial HTTP response must contain the actual salon's important content as HTML.

A search engine, AI crawler, browser with JavaScript disabled, or accessibility tool should be able to understand:

* Salon name
* Salon description/tagline
* Address
* Phone
* Business hours
* Services
* Service prices
* Service durations
* Staff/team
* Reviews when available
* Salon images
* Links to important pages
* Booking link

without requiring React/JavaScript to execute first.

JavaScript can still be used for enhancement and interaction.

This is **HTML-first / SSR**, NOT "zero JavaScript."

---

# CRITICAL ARCHITECTURE DECISION

The audit has already confirmed that Certxa has an existing server-rendered implementation:

`publisherType = "auto"`

This implementation must become the foundation.

DO NOT build a second salon website rendering system.

DO NOT throw away `render-salon-page.ts`.

DO NOT replace the existing tenant routing architecture.

DO NOT rewrite the booking application.

Improve and extend the existing `auto` renderer.

---

# EXISTING ARCHITECTURE TO PRESERVE

The existing request flow is approximately:

nginx wildcard `*.certxa.com`
→ Express
→ `subdomainMiddleware`
→ tenant resolution
→ `handleTenantSiteBySlug`
→ publisherType branch
→ auto renderer OR template renderer

The existing booking application is separate:

`certxa.com/book/{slug}`

and uses the existing public booking APIs and TURN/resource logic.

KEEP THIS SEPARATION.

The salon website is the public informational website.

The booking application is the transactional booking application.

---

# ABSOLUTE DO-NOT-BREAK RULES

Do NOT modify or replace:

* TURN logic
* appointment availability logic
* staff assignment logic
* booking engine behavior
* `/book/{slug}` booking flow
* Stripe Connect
* Stripe subscription billing
* POS
* customer management
* calendar
* payment processing
* SMS
* Google Business Profile integration
* existing appointment creation logic
* existing resource/station capacity logic
* existing salon tenant isolation
* existing production database structure unless a migration is specifically required
* existing PHP marketing pages
* existing domain/slug routing
* existing custom domain support
* existing salon slugs
* existing booking slugs

Do NOT introduce:

* Supabase
* Laravel
* a second booking engine
* a second website renderer
* a new unrelated CMS
* a destructive database migration

DO NOT run:

`drizzle-kit push`

Do not drop existing tables.

Do not delete production data.

Do not rename existing core tables merely to make the new architecture cleaner.

---

# PHASE 0 — READ-ONLY INSPECTION

First inspect the relevant implementation.

Specifically inspect:

* `subdomainMiddleware`
* `handleTenantSiteBySlug`
* `serveAutoPage`
* `render-salon-page.ts`
* `wb_websites`
* `wb_templates`
* website publishing logic
* website editor/publisher logic
* tenant data endpoints
* tenant preview endpoints
* sitemap handling
* tenant SEO/JSON-LD generation
* service queries
* staff queries
* review queries
* booking route `/book/{slug}`
* any existing `/widget?slug=...`
* nginx routing if relevant

Also inspect how `publisherType` is currently assigned.

Determine:

1. Which salons currently use `auto`.
2. Which salons currently use `template`.
3. Whether changing the default for NEW websites is safe.
4. Whether existing template websites can remain untouched.
5. Exactly where the tenant sitemap is currently intercepted.
6. Exactly how salon data gets into the initial HTML.
7. Which existing renderer functions can be reused.

Do not make assumptions.

After inspection, report:

### CURRENT STATE

* files inspected
* current rendering flow
* current risks
* exact files you intend to modify

Then proceed with implementation.

---

# PHASE 1 — MAKE AUTO SSR THE PRIMARY FOUNDATION

Improve the existing `publisherType = "auto"` renderer.

The existing auto renderer already produces server-rendered HTML.

Make it substantially more complete.

The initial HTML should include real:

## Business information

* salon name
* description/tagline
* address
* phone
* website/booking URL
* hours
* location information
* social links where configured

## Services

For every public active service:

* service name
* price
* duration
* category
* description when available
* image when available
* booking link

Do not invent service information.

Only render data that actually exists in the database.

## Staff

For every public active staff member:

* name
* photo
* title/role when available
* description/bio when available
* relevant services when available

## Reviews

Render public reviews that are actually stored as public.

Do NOT manufacture reviews.

Do NOT convert private feedback into public reviews.

Do NOT change the current review-gating rules in this phase.

That will be a separate project.

---

# PHASE 2 — REAL WEBSITE PAGE STRUCTURE

The salon website should eventually support real URLs rather than relying on anchor fragments such as:

`/#services`

Create the architecture for these pages:

`/`

`/services/`

`/services/{service-slug}`

`/team/`

`/team/{staff-slug}`

`/reviews/`

Do not break the homepage.

Do not immediately remove existing template functionality.

For this phase, implement the routing/rendering architecture in the existing tenant website system.

Each page must return real HTML from the server.

Do NOT make these merely client-side React routes.

---

# SERVICE PAGES

A service page should contain:

* service name
* category
* price
* duration
* description
* image if available
* relevant service options/add-ons when appropriate
* clear Book Now link

The Book Now link should point to the existing booking application:

`https://certxa.com/book/{slug}`

Use a normal HTML anchor:

`<a href="...">Book Now</a>`

Do NOT create another booking flow.

Do NOT embed a second booking application into the service page.

Do NOT make Book Now depend on JavaScript.

JavaScript enhancement may be added later, but the basic link must work without JavaScript.

---

# TEAM PAGES

Create real server-rendered team member pages:

`/team/{staff-slug}`

Each page should contain available information such as:

* staff name
* photo
* title
* bio
* services
* booking link

Again, use real HTML.

---

# REVIEWS PAGE

Create:

`/reviews/`

Render public Certxa reviews that already exist.

For now:

* only render reviews already marked public according to the existing system
* do not change review eligibility
* do not change review gating
* do not invent review content
* do not allow owners to create reviews

The future first-party verified review system will be implemented separately.

---

# PHASE 3 — STRUCTURED DATA

Unify the structured data strategy.

Currently some richer JSON-LD exists in the template system while auto mode has less complete structured data.

Move toward a shared structured-data builder that can be used by the SSR website.

Use appropriate schema.org types.

For a nail salon, use the appropriate `NailSalon` / `LocalBusiness` structure where appropriate.

Include, when real data exists:

* business name
* URL
* telephone
* PostalAddress
* geo coordinates
* opening hours
* service information
* service offers/prices
* staff where appropriate
* breadcrumbs
* reviews/ratings only when legitimate and compliant

Do NOT fabricate:

* prices
* ratings
* review counts
* reviews
* geographic information
* opening hours

Remove hardcoded values such as a hardcoded `$` price range if they are not actually derived from salon data.

---

# IMPORTANT GOOGLE REVIEW RULE

Do NOT implement anything that implies Certxa-owned reviews automatically qualify for Google's star rich result.

The website may expose legitimate structured review information where appropriate, but follow Google's current structured-data requirements.

Do not create fake AggregateRating values.

Do not create review markup for reviews that aren't visibly present on the page.

Do not create a mechanism intended to manipulate Google's review system.

---

# PHASE 4 — SEO METADATA

Every salon page should have correct server-generated:

* `<title>`
* meta description
* canonical URL
* Open Graph title
* Open Graph description
* Open Graph image
* Twitter metadata where appropriate

The canonical should represent the actual salon URL.

Example:

`https://bellanails.certxa.com/`

For a service:

`https://bellanails.certxa.com/services/gel-x`

For a team member:

`https://bellanails.certxa.com/team/jane-doe`

Do not create duplicate canonical URLs.

---

# PHASE 5 — SITEMAP

Fix the current tenant sitemap problem.

The current audit indicates that `/sitemap.xml` is being intercepted by tenant middleware and the richer sitemap path is effectively unreachable.

Fix this cleanly.

Every published salon website should have a valid:

`https://{slug}.certxa.com/sitemap.xml`

It should include the real crawlable pages for that salon, such as:

* homepage
* services
* individual service pages
* team
* individual team pages
* reviews

Only include pages that actually exist.

Do NOT include fragment URLs such as:

`/#services`

Do NOT create fake URLs.

Make sure the sitemap response is valid XML with the correct content type.

Also ensure:

`/robots.txt`

exists and points to the correct tenant sitemap.

Example:

`Sitemap: https://bellanails.certxa.com/sitemap.xml`

Do not interfere with Certxa's global/root sitemap system.

---

# PHASE 6 — CACHING / PERFORMANCE

The auto SSR renderer already has useful cache headers.

Preserve and improve that approach.

Avoid:

* `no-store` for normal public salon pages
* reading large template bundles from disk on every request
* unnecessary repeated database queries

Use appropriate public caching such as:

`s-maxage`

and:

`stale-while-revalidate`

where safe.

Do NOT cache private/admin data.

Do NOT cache unpublished salon content publicly.

When a salon publishes an update, ensure the relevant public cache is invalidated or expires appropriately.

---

# PHASE 7 — SECURITY FIXES FROM THE AUDIT

While touching the tenant website system, fix the following security issues identified by the audit.

## 1. Unpublished tenant data

Ensure:

`/tenant/:slug/data`

and

`/tenant/:slug/status`

do NOT expose unpublished website/business data.

Published state must be enforced server-side.

## 2. `/tenant/:slug`

Do not return:

* customDomainToken
* Stripe checkout session IDs
* filesystem paths
* build errors
* internal implementation details

Do not use unrestricted:

`SELECT *`

when returning tenant information.

Return only fields actually required by the client.

## 3. Website preview

Verify that:

`/websites/:id/preview`

has appropriate authentication/ownership protection.

Do not expose private website drafts to arbitrary users.

## 4. Tenant API rate limiting

Review the tenant public endpoints and add appropriate rate limiting where it can be done safely.

Do not interfere with normal public website crawling.

Do not introduce a rate limiter that blocks legitimate search engines or AI crawlers unnecessarily.

---

# PHASE 8 — NEW WEBSITE DEFAULT

After verifying the new auto SSR system works correctly:

New salon websites should default to the HTML-first SSR implementation.

Existing template websites should NOT automatically be converted during this change.

Do not break existing salons.

Do not silently change the appearance of existing production websites.

The existing template renderer can remain during the transition.

However, the architecture should clearly establish:

AUTO SSR = preferred/default future architecture

TEMPLATE CSR = legacy/transition architecture

---

# PHASE 9 — VISUAL CUSTOMIZATION

Do NOT destroy the existing visual website builder.

The salon owner still needs the ability to customize the appearance.

However, separate:

CONTENT / SEMANTIC DATA

from:

PRESENTATION / DESIGN

The server-rendered HTML structure should remain consistent and SEO/GEO-friendly regardless of visual theme.

Themes should control things such as:

colors
typography
spacing
layout
section appearance
imagery
branding

Themes should NOT determine whether important business content exists in the initial HTML.

This is extremely important.

Certxa should control the semantic HTML/data architecture.

The visual theme should control presentation.

PHASE 10 — BOOK NOW ARCHITECTURE

Do not create another booking system.

The salon website's job is to present the salon and send the customer to the existing booking system.

Primary CTA:

Book Now

should use a normal link to:

https://certxa.com/book/{slug}

Preserve the existing booking app and all of its functionality.

The booking application must continue to handle:

service selection
add-ons
staff/resource availability
TURN
date/time
customer information
deposits
payment
appointment creation

Do not duplicate any of this inside the salon website.

VERY IMPORTANT — DO NOT OVER-ENGINEER THIS

Do NOT attempt to implement the future Certxa Verified Reviews platform in this task.

Do NOT redesign the entire booking engine.

Do NOT redesign the POS.

Do NOT redesign the website editor.

Do NOT migrate all existing template sites.

Do NOT rebuild the database.

Do NOT create a new CMS.

Do NOT replace Express.

Do NOT replace React/Vite.

Do NOT replace Next.js.

Do NOT replace the existing tenant routing system.

The purpose of this change is:

Turn Certxa's existing salon website system into a strong HTML-first/SSR public website platform.
GEO / AI CRAWLER REQUIREMENT

Think beyond traditional Google SEO.

The rendered HTML should make it easy for an AI/search crawler to answer questions such as:

"What services does Bella Nails offer?"

"What does Bella Nails charge for Gel-X?"

"How long does a Gel-X appointment take at Bella Nails?"

"Who works at Bella Nails?"

"What are customers saying about Bella Nails?"

"Where is Bella Nails located?"

"Does Bella Nails offer pedicures?"

The information should exist in normal HTML and semantic structure.

Do not rely on:

hidden JSON alone
JavaScript-generated text
client-side API calls
canvas
image-only text

JSON-LD is supplemental.

The important business information must exist in visible HTML.

DATA INTEGRITY

The database remains the source of truth.

Use the existing:

locations
services
service_categories
staff
reviews
hours
gallery/media
website configuration

Do not invent records.

Do not duplicate service records just for SEO pages.

Service pages must reference the existing service records.

Use stable slugs.

If a service slug changes, avoid creating unnecessary duplicate pages.

MULTI-TENANT SAFETY

Every public page must be scoped to the current salon/store.

Never allow:

salon-a.certxa.com

to display data belonging to:

salon-b.certxa.com

Verify store/tenant ownership at every database query.

Use the existing store ID/location relationship.

Do not weaken tenant isolation in the name of SEO.

IMPLEMENTATION REQUIREMENTS

Before modifying files:

Identify every file that will change.
Explain why each file needs modification.
Identify any migration required.
Explain whether the migration is additive and reversible.
Identify any routes that may conflict.
Identify any caching implications.

Then implement.

After implementation:

Run tests/builds

At minimum validate:

Homepage

https://{slug}.certxa.com/

Services

https://{slug}.certxa.com/services/

Individual service

https://{slug}.certxa.com/services/{service-slug}

Team

https://{slug}.certxa.com/team/

Individual team member

https://{slug}.certxa.com/team/{staff-slug}

Reviews

https://{slug}.certxa.com/reviews/

Sitemap

https://{slug}.certxa.com/sitemap.xml

Robots

https://{slug}.certxa.com/robots.txt

Booking

https://certxa.com/book/{slug}

Verify that the booking application remains completely functional.

HTML VALIDATION

For each public page, inspect the raw HTTP response before JavaScript executes.

Confirm the raw HTML contains actual:

salon name
service names
prices
durations
staff names
business address
business hours
visible content

Do not simply inspect the browser's post-JavaScript DOM.

The requirement is the initial server response.

FINAL REPORT

When finished, provide:

1. Files changed

List every changed file.

2. Database changes

List any migration and explain why it was required.

If no migration was required, explicitly say so.

3. Routes added/changed

List them.

4. Rendering architecture

Explain how the new SSR flow works.

5. SEO

Explain what is now present in initial HTML.

6. GEO / AI discoverability

Explain how the new architecture makes salon information easier for search engines and AI crawlers to understand.

7. Security

List the security issues fixed.

8. Booking safety

Explicitly confirm that /book/{slug}, TURN, availability, and appointment creation were not replaced or duplicated.

9. Existing websites

Explain what happens to existing template websites.

10. Testing

List the tests/builds performed and their results.

SUCCESS CRITERIA

This project is successful if:

A new Certxa salon website is HTML-first.
The salon's actual business information is present in the initial server response.
Services and prices are present in the initial HTML.
Team members are present in the initial HTML.
Public reviews are present when applicable.
Real service URLs exist.
Real team URLs exist.
/reviews/ exists.
Tenant sitemap works.
Tenant robots.txt works.
JSON-LD is accurate and generated from real data.
Book Now is a normal link to the existing booking application.
TURN and booking logic remain untouched.
Existing template websites are not unexpectedly broken.
Tenant isolation remains intact.
Unpublished/private data is not exposed.
The website remains visually customizable.
JavaScript is enhancement, not a requirement for understanding the salon.
Search engines and AI crawlers can understand the salon from the raw HTML.
No destructive database changes were made.
MOST IMPORTANT PRINCIPLE

Certxa should become:

a network of real, crawlable, structured salon websites backed by real salon data.

The public website should be optimized for humans, search engines, and AI crawlers.

The booking application should remain a separate transactional system.

Do not sacrifice the existing production systems to accomplish this.
