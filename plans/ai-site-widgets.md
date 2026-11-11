# AI website designer on widgets

Owner decisions, 2026-11-11:
- The AI decides the site's structure: one long page or tabs, which widgets go on each page, their order and their look.
- Solo and Aspen are rebuilt on the same widgets, so one fix reaches every website.
- Certxa Pro (one person) first; salons with several staff next.

## Why

Today an AI site is the Solo website with the AI's colours, fonts and a few About blocks (AiFoundationTheme.tsx, a
2,463-line copy of SoloTheme.tsx). Every AI site has the same shape. Solo fixes must be copied by hand, and blocks can
repeat what the page already shows; the services, reviews and location blocks on About were removed 11-11.

## Widgets

Each widget loads its own live data and keeps its own working booking or checkout. It takes the site's design (colours,
fonts, corners, heading case) and offers a few looks. It appears at most once per site.

| Widget | From SoloTheme.tsx today | Looks (first set) |
|---|---|---|
| Services | Services tab: categories, service cards, add-on groups, Book this look, service pages nav | menu board · cards · compact |
| Booking | BookingPanel (line ~515) and the chosen-services bar | one: the real flow, opened by any Book button |
| Reviews | About: rating, Ratings & Reviews / Reviews from Google, review photos | quotes · carousel · grid |
| Portfolio | Portfolio tab: masonry grid, lightbox, Book this look | masonry · grid · strip |
| Our Team | (new for Pro: the pro; salons later: staff with Aspen's staff picker) | card · row |
| Contact | About: Contact, Send a message, Visit us, hours, directions | card · split with map link |
| Cart | Header cart, gift cards, packages, products (siteShop), balance checks | header cart + shop section |

The AI also writes the words around the widgets: hero, our story, FAQ, the closing "book" section, house calls. These
are the existing AiSiteTheme.tsx blocks without the data blocks (priceList, reviews, gallery, location), which become
widgets.

Always the same, whatever the AI picks:
- the header with the name, Book Now and Cart;
- the footer with legal links;
- the claim notice on prepared pages;
- SEO head and JSON-LD (server lib/salonSeo.ts).

## Site spec (what the AI writes)

```
theme: palette, fonts, corners, headingCase            (as today)
layout: "tabs" | "one-page"
pages: [{ id, title, sections: [ widget | words block ] }]   1–5 pages; one-page = a single page
  widget  = { widget: "services" | "reviews" | "portfolio" | "team" | "contact" | "shop", look, title?, intro? }
  words   = hero | about | faq | callToAction | houseCalls | featuredPerson (existing block schema)
```

The server checks the spec and fixes it (tidy):
- Services must be somewhere; every widget appears at most once.
- A widget with nothing to show is dropped: no photos means no Portfolio, no reviews means no Reviews, no shop items
  means no shop.
- Tab ids map to today's anchors (#about, #services, #portfolio, #contact), so shared links keep working.

## Steps

1. **Widgets out of Solo.** Move each part of SoloTheme.tsx into public-booking/widgets/*, with Solo's look as the
   default. SoloTheme becomes a fixed layout of widgets. Solo sites must look and work the same: screenshots of tobys and
   two other Pro sites before and after, at phone and desktop widths, plus a booking, add-on group and cart check.
2. **Aspen on the widgets.** Same check on an Aspen site.
3. **AI layout.** A new AI theme renders spec.pages from the widgets and replaces AiFoundationTheme.tsx. Update the
   builder's schema and rules (aiSiteBuild.ts), chat changes (aiSiteChange.ts) and ideas (aiSiteIdeas.ts) so that ideas
   differ in layout too.
4. **Designer.** Preview and chat in the app and on /website-designer show pages and widgets; chat can move, add,
   remove and restyle widgets.
5. **Existing AI designs.** Convert old specs: home blocks become an About page, plus a Services page and the other
   widgets in Solo's order.
6. **Salons.** Our Team with several staff, and booking with a staff picker (Aspen's).

Each step is deployed on its own and must leave every live website unchanged until step 3 is switched on.
