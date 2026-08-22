# Certxa SEO page map

These pages are intentionally separated by search intent so they can rank for different salon-software queries without competing with one another.

## Existing commercial pages

| URL | Primary search intent | Suggested title | Suggested H1 |
|---|---|---|---|
| `/salon-software-platform.html` | all-in-one salon software | Salon Software \| Booking, Payments & Management \| Certxa | Salon software for more possibility |
| `/salon-software.html` | salon business software / operations | Salon Business Software for Growing Teams \| Certxa | Get booked. Stay booked. |
| `/calendar-scheduling-app.html` | salon appointment scheduling | Appointment Scheduling Software for Salons \| Certxa | Turn every minute into momentum |
| `/online-booking.html` | salon online booking | Online Booking Software for Salons \| Certxa | Book more clients, faster |
| `/custom-booking-website.html` | salon booking website builder | Salon Booking Website Builder \| Certxa | A booking site that feels like you |
| `/get-client-reviews.html` | salon reputation management | Salon Reputation Management Software \| Certxa | More reviews. More momentum. |
| `/nail-salon-software.html` | nail salon software | Nail Salon Software & POS System \| Certxa | Turn walk-ins into regulars |
| `/pricing.html` | salon software pricing | Salon Software Pricing \| Certxa | More value. Fewer decisions. |

## Recommended next commercial pages

Create these only when Certxa has genuinely differentiated content and product capability for the query:

- `/salon-pos-system.html` — salon POS system and payment processing
- `/salon-management-software.html` — salon management software
- `/salon-client-management.html` — salon client management software
- `/salon-marketing-software.html` — salon marketing software
- `/salon-payroll-software.html` — salon payroll and commission management
- `/booth-renter-software.html` — software for booth renters
- `/beauty-business-booking-software.html` — booking software for beauty professionals
- `/spa-booking-software.html` — spa booking software
- `/barbershop-booking-software.html` — barbershop booking software

## On-page rules for every page

1. Use one specific primary query per page. Put it in the title, H1, introduction, one subheading, and a natural internal link.
2. Write a unique 145–160 character description that explains the page benefit and includes the primary query naturally.
3. Use one self-referencing canonical URL and index only pages with useful, original content.
4. Add `SoftwareApplication` or `Service` schema where appropriate; add `FAQPage` only when the visible page contains the same questions and answers.
5. Link related pages together with descriptive anchors, for example `salon online booking software` rather than `click here`.
6. Do not add a `meta keywords` tag. Google does not use it as a ranking signal.
7. Keep pricing, feature claims, testimonials, and customer numbers accurate and supportable.
8. Exclude signup, login, campaign, duplicate, and thin utility pages from indexing with `noindex,follow`.

## Recommended site architecture

```text
/salon-software-platform.html
  ├── /online-booking.html
  ├── /calendar-scheduling-app.html
  ├── /salon-pos-system.html
  ├── /salon-client-management.html
  └── /salon-marketing-software.html
```

The existing `sitemap.xml` should contain only canonical, indexable Certxa URLs. Keep the generated source inventory in `core-pages/manifest.json` as a migration reference, not as a public sitemap.