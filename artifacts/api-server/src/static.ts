import { type Request } from "express";

const BASE_URL = (process.env.APP_URL ?? "https://certxa.com").replace(/\/$/, "");
const TRIAL_DAYS = process.env.TRIAL_PERIOD_DAYS ?? "60";

interface PageSeo { title: string; description: string; canonical: string; }

export const SEO_CONFIG: Record<string, PageSeo> = {
  // Commercial routes are normally server-rendered by PHP. Keeping their SEO
  // metadata here as well protects the raw HTML response if a PHP template is
  // removed and the URL falls through to the React application.
  "/nail-salon-software": { title: "Nail Salon Booking Software | Certxa", description: `Nail salon software for independent nail technicians and growing studios. Certxa connects online booking, client nail records, reminders, payments, POS, walk-ins, and a booking website in one platform. ${TRIAL_DAYS}-day free trial.`, canonical: `${BASE_URL}/nail-salon-software` },
  "/online-booking": { title: "Nail Salon Online Booking | Certxa", description: "Nail salon booking software for online appointments, technician selection, deposits, reminders, waitlists, and walk-ins. Let clients book from your website, social profiles, or Google with Certxa.", canonical: `${BASE_URL}/online-booking` },
  "/salonos": { title: "Nail Salon Management Software | Certxa", description: "Nail salon management software for appointments, staff calendars, client records, walk-ins, POS, waitlists, loyalty, and daily operations. SalonOS connects the workflows of growing nail studios.", canonical: `${BASE_URL}/salonos` },
  "/payment-processing": { title: "Nail Salon Payment Processing | Certxa", description: "Nail salon POS and payment processing powered by Stripe. Take card, chip, contactless, Apple Pay, and Google Pay payments through the Stripe M2 reader inside Certxa.", canonical: `${BASE_URL}/payment-processing` },
  "/client-management": { title: "Salon Client Management | Certxa", description: "Nail salon client management software for profiles, appointment history, service notes, preferences, and client follow-up. Certxa keeps the details your team needs organised alongside booking and daily salon workflows.", canonical: `${BASE_URL}/client-management` },
  "/client-notifications": { title: "Salon Appointment Reminders | Certxa", description: "Nail salon appointment reminders and automated client notifications for booking confirmations, reminders, follow-ups, and rebooking messages. Certxa helps keep clients informed across your salon booking workflow.", canonical: `${BASE_URL}/client-notifications` },
  "/custom-website-builder": { title: "Salon Website Builder | Certxa", description: "Salon website builder for a branded, bookable website with templates, custom content, and Certxa online booking. Create a professional home for your nail salon or beauty business without starting from code.", canonical: `${BASE_URL}/custom-website-builder` },
  "/solo-professionals": { title: "Independent Nail Tech Software | Certxa", description: "Software for solo nail technicians to manage online booking, client nail records, reminders, payments, and daily salon work from one platform. Certxa helps independent nail professionals run a focused, organised business.", canonical: `${BASE_URL}/solo-professionals` },
  "/booth-renters": { title: "Booth Rental Software | Certxa", description: "Booking and management software for nail tech booth renters and chair renters. Manage your own clients, nail records, payments, and appointment workflow with Certxa in an account built for independent nail professionals.", canonical: `${BASE_URL}/booth-renters` },
  "/client-reviews": { title: "Salon Review Management | Certxa", description: "Automatically collect Google reviews after every appointment. Certxa salon review management software builds your online reputation on autopilot, helping new clients find and choose your salon.", canonical: `${BASE_URL}/client-reviews` },
  "/pricing": { title: "Salon Software Pricing | Certxa", description: "Simple, transparent nail salon software pricing. Certxa plans start at $9/month. No hidden fees or contracts. Booking, payments, and client management included.", canonical: `${BASE_URL}/pricing` },
  "/contact": { title: "Certxa Support | Contact Us", description: "Get in touch with the Certxa support team by phone, email, or live chat. Support is available Monday through Friday, 9am to 6pm ET.", canonical: `${BASE_URL}/contact` },
  "/autumn": { title: "AI Receptionist for Salons | Certxa", description: "Autumn answers salon calls, books appointments into your Certxa calendar, handles rescheduling, and helps clients around the clock.", canonical: `${BASE_URL}/autumn` },
  "/case-studies": { title: "Nail Salon Case Studies | Certxa", description: "See how nail studios and nail technicians transformed their business with Certxa, from solo booth renters to multi-location nail studios.", canonical: `${BASE_URL}/case-studies` },
  "/data-transfer": { title: "Salon Software Data Migration | Certxa", description: "Switch salon software with help from Certxa. Import client lists, appointments, services, and inventory from your existing platform.", canonical: `${BASE_URL}/data-transfer` },
  "/checkin-kiosk": { title: "Nail Salon Check-In Kiosk | Certxa", description: "A self-service nail salon check-in kiosk for walk-ins. Capture the requested service and technician preference, then add clients to your live waitlist.", canonical: `${BASE_URL}/checkin-kiosk` },
  "/revenue-intelligence": { title: "Salon Revenue Intelligence | Certxa", description: "Certxa Revenue Intelligence detects drifting clients, predicts no-shows, identifies open capacity, and helps salons recover lost revenue.", canonical: `${BASE_URL}/revenue-intelligence` },
  "/google-business-profile": { title: "Salon Google Booking Link | Certxa", description: "Connect your Certxa booking link to your Google Business Profile so clients can book from Google Search and Maps.", canonical: `${BASE_URL}/google-business-profile` },
  "/about": { title: "About Certxa | Salon Software", description: "Learn why Certxa built one platform for salon booking, POS, payments, team management, payroll, websites, and business operations.", canonical: `${BASE_URL}/about` },
  "/spa": { title: "Day Spa & Wellness Booking Software — Memberships & Gift Cards | Certxa", description: "Booking, memberships, gift cards, and therapist scheduling for day spas and wellness centers. Replace Mindbody for a fraction of the cost.", canonical: `${BASE_URL}/spa` },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inject route-specific metadata into the HTML document returned to crawlers.
 * This works independently of React SSR, so a SPA fallback never ships a
 * missing or generic title, description, canonical, or social preview.
 */
export function injectSeoMetadata(template: string, seo: PageSeo): string {
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const canonical = escapeHtml(seo.canonical);
  let html = template;

  const replacements: Array<[RegExp, string]> = [
    [/<title>[^<]*<\/title>/i, `<title>${title}</title>`],
    [/<meta\s+name=["']description["'][^>]*>/i, `<meta name="description" content="${description}" />`],
    [/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}" />`],
    [/<meta\s+property=["']og:title["'][^>]*>/i, `<meta property="og:title" content="${title}" />`],
    [/<meta\s+property=["']og:description["'][^>]*>/i, `<meta property="og:description" content="${description}" />`],
    [/<meta\s+property=["']og:url["'][^>]*>/i, `<meta property="og:url" content="${canonical}" />`],
    [/<meta\s+name=["']twitter:title["'][^>]*>/i, `<meta name="twitter:title" content="${title}" />`],
    [/<meta\s+name=["']twitter:description["'][^>]*>/i, `<meta name="twitter:description" content="${description}" />`],
  ];

  for (const [pattern, replacement] of replacements) {
    html = pattern.test(html)
      ? html.replace(pattern, replacement)
      : html.replace("</head>", `  ${replacement}\n  </head>`);
  }
  return html;
}

/** Force `noindex, nofollow` on the raw SPA shell. Every route that falls
 * through to the final catch-all below is an authenticated in-app page
 * (dashboard, calendar, staff tools, nail POS, etc. — see
 * KNOWN_APP_PREFIXES); real public pages are always handled earlier by PHP,
 * SSR, or SEO_CONFIG and never reach this point. The shell's static
 * index.html otherwise ships a hardcoded "index, follow" meant for the
 * marketing site, so every one of these ~80 app routes (not just the couple
 * spot-checked in a GEO audit) was being served as crawlable — see
 * GEO-AUDIT-REPORT.md. */
export function injectNoindex(template: string): string {
  const tag = '<meta name="robots" content="noindex, nofollow" />';
  const pattern = /<meta\s+name=["']robots["'][^>]*>/i;
  return pattern.test(template)
    ? template.replace(pattern, tag)
    : template.replace("</head>", `  ${tag}\n  </head>`);
}

// ── Known top-level route prefixes ────────────────────────────────────────
// First path segment of every <Route path="..."> in artifacts/booking/src/App.tsx
// (e.g. "/team/:id" -> "team", "/catalog/services" -> "catalog"). A request
// whose first segment isn't in this set is not a real app page and gets a
// real 404 from the SPA catch-all below, instead of a 200 SPA shell.
// Adding a brand-new *top-level* section to App.tsx requires adding its
// prefix here too; new routes nested under an already-known prefix need no
// change here.
export const KNOWN_APP_PREFIXES = new Set([
  "accept-invite", "account", "addons", "ai-receptionist", "analytics",
  "api-keys", "app-login", "appointments", "auth", "autumn", "b", "barber", "billing",
  "book", "booking", "booking-policies", "business-hours", "business-settings",
  "calendar", "calendar-settings", "campaigns", "cash-drawer", "catalog",
  "chat", "checkin-kiosk", "chkeditor", "client", "client-lookup", "clients",
  "commission-report", "commissions", "complete-booking", "contact",
  "contractor-onboarding", "customers", "dashboard", "data-transfer",
  "elite-api-docs", "elite-details", "faq", "features", "features-settings", "forgot-password",
  "frontdesk", "gift-cards", "google-business", "help", "how-it-works", "intake-forms",
  "intelligence", "isTeam", "isadmin", "kiosk", "kiosk-settings",
  "language-settings", "loyalty", "mail-settings", "manage", "marketing",
  "marketplace-ads",
  "multi-location", "nail", "onboarding", "online-booking", "overview", "payments", "payouts",
  "payroll", "payroll-settings", "pos", "pos-settings", "pricing", "print-checks", "products", "pro-plus", "q",
  "receipt", "redeem", "register-reports", "rentals", "reports", "reset-password", "resources", "review", "reviews",
  "salon-dashboard", "salon-earnings", "services", "settings", "setup",
  "sms-activity", "sms-inbox", "sms-settings", "spa", "staff", "staff-1099",
  "staff-auth", "staff-calendar", "staff-dashboard", "staff-financial-hub",
  "staff-history", "staff-income", "staff-language", "staff-menu",
  "staff-overview", "staff-pay", "staff-payouts", "staff-pos",
  "staff-profile", "subscription", "support", "tattoo-studio", "team",
  "timeclock", "waitlist", "walk-in-board", "walkins", "widget",
]);

// React Router matches paths case-insensitively, so the allowlist check must
// too — otherwise /isteam hard-404s at the server while /isTeam works.
export const KNOWN_APP_PREFIXES_LC = new Set(
  [...KNOWN_APP_PREFIXES].map((s) => s.toLowerCase()),
);

/** True when the first path segment is a known top-level app route (any case). */
export function isKnownAppFirstSegment(reqPath: string): boolean {
  if (reqPath === "/") return true;
  const first = reqPath.split("/")[1] ?? "";
  return KNOWN_APP_PREFIXES_LC.has(first.toLowerCase());
}

/**
 * True for requests to rentals.certxa.com — none of SEO_CONFIG's entries
 * (all Salon commercial landing pages) are meant for that host. Without this
 * guard, a path collision like "/pricing" (real on both sites) would inject
 * Salon's title/description into the raw HTML of the Rentals marketing page
 * a crawler or link-preview bot sees, even though real users get the correct
 * client-rendered page either way.
 */
export function isRentalsHost(req: Request): boolean {
  const forwardedHost = req.headers["x-forwarded-host"];
  const hostHeader = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost;
  const host = (hostHeader || req.headers.host || "").split(":")[0];
  return host === "rentals.certxa.com";
}

export const NOT_FOUND_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="robots" content="noindex" /><title>404 Not Found | Certxa</title></head>
<body><h1>404 Not Found</h1><p>The page you requested does not exist.</p></body>
</html>`;

// There is deliberately no serveStatic() here. Static files, the server-rendered pages and the SPA
// catch-all are all registered inline in index.ts. A second copy used to live in this file; nothing
// called it, the two had drifted apart, and edits made to it had no effect at runtime.
