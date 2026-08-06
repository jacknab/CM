import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { SEO_CONFIG } from "@/lib/seoConfig";

const SITE_BASE = "https://certxa.com";

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const seo = SEO_CONFIG[location.pathname];

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.name = name;
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setOg = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.content = content;
    };

    const setCanonical = (href: string) => {
      let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.rel = "canonical";
        document.head.appendChild(el);
      }
      el.href = href;
    };

    // Pages that are strictly internal and should never be indexed
    const isInternalPath =
      location.pathname.startsWith("/api") ||
      location.pathname.startsWith("/auth") ||
      location.pathname.startsWith("/manage") ||
      location.pathname.startsWith("/staff") ||
      location.pathname.startsWith("/admin") ||
      location.pathname.startsWith("/isadmin") ||
      location.pathname.startsWith("/isTeam") ||
      location.pathname.startsWith("/onboarding") ||
      location.pathname.startsWith("/dashboard") ||
      location.pathname.startsWith("/calendar") ||
      location.pathname.startsWith("/customers") ||
      location.pathname.startsWith("/products") ||
      location.pathname.startsWith("/booking/"); // confirmation pages (/booking/:phone)

    if (!seo) {
      if (isInternalPath) {
        // Block indexing of internal app pages
        setMeta("robots", "noindex, nofollow");
      } else {
        // Unknown public pages: allow indexing, set canonical to actual URL
        setMeta("robots", "index, follow");
        setCanonical(`${SITE_BASE}${location.pathname}`);
      }
      return;
    }

    // Known page with full SEO config
    document.title = seo.title;
    setMeta("description", seo.description);
    setMeta("robots", "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1");
    setMeta("twitter:title", seo.title);
    setMeta("twitter:description", seo.description);
    setOg("og:title", seo.title);
    setOg("og:description", seo.description);
    setOg("og:url", seo.canonical);
    setCanonical(seo.canonical);
  }, [location.pathname]);

  return null;
}
