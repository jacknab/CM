/**
 * The Solo website's shared state (owner, 2026-11-11; plans/ai-site-widgets.md): page data, tabs, the chosen services
 * and add-ons, the booking panel. Every widget reads it with useSite(). Moved here unchanged from SoloTheme.tsx.
 */
import { createContext, useContext } from "react";
import { BusyError, getPublicJson } from "../publicFetch";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCancellationPolicy } from "@/hooks/use-public-booking";
import { type ShopData, type ShopView } from "../SoloShop";
import { bookingClosed } from "../bookingClosed";
import { type CartLine } from "../SoloCart";
import { toast } from "@/hooks/use-toast";
import { MAX_VISIT_MINUTES, canAddService } from "../twoServices";
import { AddonData, ServiceAddonData } from "../types";
import { ServiceEntry, ServiceCategoryEntry, GoogleReviewEntry, ServiceReviewEntry, TeamMember, proPrice, pricesVary, SoloTab, SOLO_TABS, GalleryPhoto, extractCity, formatBusinessHours, buildDirectionsUrl, type BloomThemeProps } from "./shared";

/** "aspen": booking starts with a Staff step and the chat shows (AspenTheme, owner 2026-11-07); "solo" otherwise. */
export type SiteDesign = "solo" | "aspen";

/** An AI design's page (AiWidgetTheme.tsx): its address, tab name and the widgets on it. */
export type SitePage = { id: string; title: string; widgets: string[] };

export function useSoloSite({ store, slug, preselectedStaffId, preselectedServiceId }: BloomThemeProps, design: SiteDesign = "solo", pages?: SitePage[]) {
  // Page data
  const [services, setServices]   = useState<ServiceEntry[]>([]);
  const [serviceCategories, setServiceCategories] = useState<ServiceCategoryEntry[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true); // loading from the first paint: the menu is fetched at once
  const [reviews, setReviews]     = useState<GoogleReviewEntry[]>([]);
  const [gallery, setGallery]     = useState<GalleryPhoto[]>([]);
  // The menu links to Portfolio only when there are photos to show.
  const portfolioLink = gallery.length > 0 ? [{ label: "Portfolio", href: "#portfolio" }] : [];
  // Gift cards and packages: in the menu only when the pro offers them (api-server routes/siteShop.ts).
  const [shop, setShop] = useState<ShopData | null>(null);
  // A personal booking link the pro texted from the app (owner, 2026-11-09): <slug>.certxa.com/?c=<code> fills in the
  // client's name, phone and e-mail on the booking form. An expired or wrong code just leaves the form empty.
  const [knownClient, setKnownClient] = useState<{ name: string; phone: string; email: string } | null>(null);
  useEffect(() => {
    const code = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("c") : null;
    if (!code || !slug) return;
    fetch(`/api/public/store/${encodeURIComponent(slug)}/booking-link/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.name || d?.phone) setKnownClient(d); }).catch(() => undefined);
  }, [slug]);
  const [shopView, setShopView] = useState<ShopView | null>(null);
  useEffect(() => {
    getPublicJson<ShopData>(`/api/public/store/${slug}/shop`).then(setShop).catch(() => setShop(null));
  }, [slug]);
  const shopLinks = [
    ...(shop?.giftCards ? [{ label: "Gift Cards", href: "#gift-cards" }] : []),
    ...(shop?.packages?.length ? [{ label: "Packages", href: "#packages" }] : []),
  ];
  const closeShop = () => { setShopView(null); window.history.replaceState(null, "", window.location.pathname + window.location.search); };

  // Tabs under the header. Sections stay on the page when hidden, so a chosen category or form isn't lost.
  // An AI design's pages instead (owner, 2026-11-11): an address is a page, or a widget on one (#services opens the page
  // with the services); #about is the page with the intro, else the first.
  const pageFor = (id: string): string | null => {
    if (!pages?.length) return SOLO_TABS.some((t) => t.id === id) ? id : null;
    if (pages.some((p) => p.id === id)) return id;
    const widget = id === "about" ? "intro" : id;
    return pages.find((p) => p.widgets.includes(widget))?.id ?? (id === "about" ? pages[0].id : null);
  };
  const tabFromHash = (): string | null => {
    const h = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
    if (h === "visit") return pageFor("about"); // links shared before About replaced Visit Us
    return pageFor(h);
  };
  /** On a page of several widgets, bring the one asked for into view (#services, #portfolio). */
  const showWidget = (id: string) => {
    if (!pages?.length || pages.some((p) => p.id === id)) return false;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" }));
    return true;
  };
  const [pickedTab, setPickedTab] = useState<string>(() => tabFromHash() ?? (pages?.length ? pages[0].id : "services"));
  const tab: string = !pages?.length && pickedTab === "portfolio" && gallery.length === 0 ? "services" : pickedTab;
  const servicesTab = pages?.length ? pageFor("services") : "services";
  // The links in the menu and footer: Solo's tabs, or the AI design's pages.
  const pageLinks = pages?.length
    ? [...pages.map((p) => ({ label: p.title, href: `#${p.id}` })), ...(pages.some((p) => p.id === "contact") ? [] : [{ label: "Contact", href: "#message" }])]
    : [{ label: "About", href: "#about" }, { label: "Services", href: "#services" }, ...portfolioLink, { label: "Contact", href: "#message" }];
  const tabsTop = useRef<HTMLDivElement>(null);
  /** Where the tab bar sits under the fixed header. */
  const tabsY = () => (tabsTop.current?.getBoundingClientRect().top ?? 0) + window.scrollY - (document.querySelector("header")?.offsetHeight ?? 64);
  const pickTab = (id: string) => {
    setPickedTab(pageFor(id) ?? id);
    window.history.replaceState(null, "", `#${id}`);
    if (showWidget(id)) return;
    // Scrolled down a long tab: start the new one from its top.
    if (window.scrollY > tabsY()) window.scrollTo({ top: tabsY() });
  };
  // A menu or footer link (or a shared link) changes the address: open that tab and bring it into view.
  useEffect(() => {
    const open = () => {
      const h = window.location.hash.slice(1);
      if (h === "gift-cards" || h === "packages") { setShopView(h); setMenuOpen(false); return; }
      const id = tabFromHash();
      if (!id) return;
      setPickedTab(id);
      if (showWidget(h)) return;
      requestAnimationFrame(() => window.scrollTo({ top: tabsY(), behavior: "smooth" }));
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  /** Backend AI-matched service reviews — keyed by service ID (string or number) */
  const [serviceReviews, setServiceReviews] = useState<Record<string, ServiceReviewEntry>>({});
  // The professionals clients can book. With two or more: the team on the About tab, and a choice when booking.
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [staffChoice, setStaffChoice] = useState<number | null>(preselectedStaffId ?? null);
  const teamShown = team.length >= 2;
  const priced = team.some((m) => m.prices);
  /** The business switched its booking system off: the website stays, its booking controls go. */
  // Booking System off, or "Who can book online" set to Nobody (bookingClosed.tsx).
  const bookingOff = bookingClosed(store);
  const [activeCategory, setActiveCategory] = useState("All");

  // Header state
  const [scrolled, setScrolled]   = useState(false);
  const [menuOpen, setMenuOpen]   = useState(false);

  // Booking panel state
  const [bookingOpen, setBookingOpen]                       = useState(false);
  // Services picked on the Services tab (up to two), booked together from the bar at the bottom.
  const [cart, setCart]                                     = useState<ServiceEntry[]>([]);
  const barShown = !bookingOff && (tab === servicesTab || cart.length > 0);
  const [cartAddons, setCartAddons]                         = useState<Record<number, number[]>>({});
  const [cartOpen, setCartOpen]                             = useState(false);
  /** The one service showing its add-ons. */
  const [expandedId, setExpandedId]                         = useState<number | null>(null);
  const [addons, setAddons]                                 = useState<AddonData[]>([]);
  const [serviceAddons, setServiceAddons]                   = useState<ServiceAddonData[]>([]);
  // Only add-ons that reach the service through an Add-on Group are offered, in the group's order.
  const addonsFor = (serviceId: number) => {
    const byId = new Map(addons.map((a) => [Number(a.id), a]));
    return serviceAddons
      .filter((x) => Number(x.serviceId) === Number(serviceId))
      .map((x) => byId.get(Number(x.addonId)))
      .filter((a): a is AddonData => !!a);
  };
  // An add-on chosen three times is in the list three times, which is how the booking carries a quantity.
  const chosenFor = (serviceId: number) => (cartAddons[serviceId] ?? []).map((id) => addons.find((a) => a.id === id)).filter((a): a is AddonData => !!a);
  const [serviceQty, setServiceQty] = useState<Record<number, number>>({});
  const qtyOf = (x: ServiceEntry) => serviceQty[x.id] ?? 1;
  /** A service as the visit sees it: its whole price and time for however many. */
  const inVisit = (x: ServiceEntry): ServiceEntry => {
    const quantity = qtyOf(x);
    return quantity > 1 ? { ...x, name: `${x.name} × ${quantity}`, price: Number(x.price ?? 0) * quantity, duration: (x.duration ?? 60) * quantity, quantity } : x;
  };
  /** What the page shows for a service: at a barbershop or hair salon, the chosen professional's price (else "from"). */
  const shownPrice = (x: ServiceEntry) => (priced ? proPrice(inVisit(x), team, staffChoice) : Number(inVisit(x).price ?? 0));
  const fromPrice = (x: ServiceEntry) => priced && staffChoice == null && pricesVary(x, team);
  const chosenAddons = cart.flatMap((x) => chosenFor(x.id));
  const cartTotal = cart.reduce((sum, x) => sum + shownPrice(x), 0) + chosenAddons.reduce((sum, a) => sum + (Number(a.price) || 0), 0);
  const cartFrom = cart.some(fromPrice);
  const cartCount = cart.length + chosenAddons.length;
  const cartLines: CartLine[] = cart.map((x) => ({ id: x.id, name: inVisit(x).name, price: shownPrice(x), addons: chosenFor(x.id) }));
  /** A service with its add-ons, for the limit on two services together (twoServices.ts). */
  const visitPart = (x: ServiceEntry) => ({ id: x.id, duration: (x.duration ?? 60) * qtyOf(x) + chosenFor(x.id).reduce((sum, a) => sum + (Number(a.duration) || 0), 0) });
  const removeService = (id: number) => {
    setCart((list) => list.filter((x) => x.id !== id));
    setCartAddons((map) => { const { [id]: _gone, ...rest } = map; return rest; });
    setExpandedId((open) => (open === id ? null : open));
    setServiceQty((map) => { const { [id]: _gone, ...rest } = map; return rest; });
  };
  /** Would these minutes more go past the limit on two services together? */
  const tooLong = (more: number) => {
    if (cart.length < 2 || cart.reduce((sum, x) => sum + visitPart(x).duration, 0) + more <= MAX_VISIT_MINUTES) return false;
    toast({ title: "Two services can be booked together for up to 2½ hours. Remove something to add this." });
    return true;
  };
  /** − 1 + on an add-on: taking the last one off removes it. */
  const setAddonQty = (serviceId: number, addon: AddonData, quantity: number) => {
    const others = (cartAddons[serviceId] ?? []).filter((id) => id !== addon.id);
    const now = (cartAddons[serviceId] ?? []).length - others.length;
    if (quantity > now && tooLong(Number(addon.duration) || 0)) return;
    setCartAddons((map) => ({ ...map, [serviceId]: [...others, ...Array(Math.max(0, quantity)).fill(addon.id)] }));
  };
  /** − 1 + on a service: taking the last one off removes it. */
  const setServiceQuantity = (svc: ServiceEntry, quantity: number) => {
    if (quantity < 1) { removeService(svc.id); return; }
    if (quantity > qtyOf(svc) && tooLong(svc.duration ?? 60)) return;
    setServiceQty((map) => ({ ...map, [svc.id]: quantity }));
  };
  /** Open this service's add-ons and close the other's; the card that was tapped stays in view as that one closes. */
  const expandService = (id: number) => {
    const moved = expandedId != null && expandedId !== id;
    setExpandedId(id);
    if (moved) requestAnimationFrame(() => document.getElementById(`service-${id}`)?.scrollIntoView({ block: "start" }));
  };
  /** Not chosen: choose it. Chosen with its add-ons closed: open them. Otherwise: remove it. */
  const tapService = (svc: ServiceEntry) => {
    if (bookingOff) return;
    if (!cart.some((x) => x.id === svc.id)) {
      const clash = cart.find((x) => (x.offeredAt === "place" && svc.offeredAt === "client") || (x.offeredAt === "client" && svc.offeredAt === "place"));
      if (clash) { toast({ title: `${clash.name} and ${svc.name} can't be done on the same visit. Please book them separately.` }); return; }
      if (canAddService(cart.map(visitPart), { id: svc.id, duration: svc.duration ?? 60 })) { setCart([...cart, svc]); expandService(svc.id); }
    } else if (expandedId === svc.id || addonsFor(svc.id).length === 0) removeService(svc.id);
    else expandService(svc.id);
  };
  const toggleAddon = (serviceId: number, addon: AddonData) => {
    const on = (cartAddons[serviceId] ?? []).includes(addon.id);
    if (!on && tooLong(Number(addon.duration) || 0)) return;
    setCartAddons((map) => ({ ...map, [serviceId]: on ? (map[serviceId] ?? []).filter((id) => id !== addon.id) : [...(map[serviceId] ?? []), addon.id] }));
  };

  // Gallery lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Service card photo lightbox
  const [photoLightbox, setPhotoLightbox] = useState<string | null>(null);

  const salonName      = store.name || "Your Salon";
  const city           = extractCity(store.address);
  const phoneHref      = store.phone ? `tel:${store.phone}` : undefined;
  // (720) 243-6886, however it was saved.
  const phoneDigits    = (store.phone ?? "").replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const phoneLabel     = phoneDigits.length === 10 ? `(${phoneDigits.slice(0, 3)}) ${phoneDigits.slice(3, 6)}-${phoneDigits.slice(6)}` : store.phone;
  const directionsUrl  = buildDirectionsUrl(store.address);
  // Google's reviews are named as Google's, with Google's own count and average (owner, 2026-11-05).
  const isGoogleSourced = reviews.length > 0 && reviews.every((r) => r.source === "google");
  const reviewCount    = isGoogleSourced ? (store.googleReviews?.count || reviews.length) : store.displayReviewCount ?? store.googleReviewCount ?? reviews.length;
  // Certxa Pro accounts have Certxa's own reviews only, never Google (owner, 2026-10-30). The stored rating can be empty
  // for them, so it falls back to the reviews themselves.
  const ratedReviews   = reviews.filter((r) => Number(r.rating) > 0);
  const avgRating      = isGoogleSourced && store.googleReviews?.rating ? store.googleReviews.rating
                        : typeof store.displayRating === "number" && store.displayRating > 0 ? store.displayRating
                        : ratedReviews.length ? ratedReviews.reduce((sum, r) => sum + Number(r.rating), 0) / ratedReviews.length : 0;
  const hours          = formatBusinessHours(store.businessHours);
  const cancelPolicyText = useCancellationPolicy(slug).data?.text?.trim() ?? "";

  // Scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mobile menu scroll lock
  useEffect(() => {
    if (!bookingOpen) document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { if (!bookingOpen) document.body.style.overflow = ""; };
  }, [menuOpen, bookingOpen]);

  // Fetch services. Busy (429): the menu says so and tries again when the server allows, never an empty menu.
  const [servicesBusy, setServicesBusy] = useState<"waiting" | "failed" | null>(null);
  const [servicesTry, setServicesTry] = useState(0);
  useEffect(() => {
    if (!slug) return;
    let live = true;
    setServicesLoading(true);
    setServicesBusy(null);
    getPublicJson<any>(`/api/public/store/${slug}/services`, { onWait: () => { if (live) setServicesBusy("waiting"); }, isLive: () => live })
      .then((d) => {
        if (!live) return;
        setServicesBusy(null);
        if (Array.isArray(d?.addons)) setAddons(d.addons);
        if (Array.isArray(d?.serviceGroupAddons)) setServiceAddons(d.serviceGroupAddons);
        if (d?.services) setServices(d.services);
        const incoming = Array.isArray(d?.categories) ? d.categories : [];
        // Defensive: only keep categories that belong to this store
        const filtered = incoming.filter((c: any) => Number(c.storeId) === Number(store.id));
        setServiceCategories(filtered);
      })
      .catch((err) => { if (live && err instanceof BusyError) setServicesBusy("failed"); })
      .finally(() => { if (live) setServicesLoading(false); });
    return () => { live = false; };
  }, [slug, servicesTry]);

  // The website's service category pages (api-server lib/soloCategoryPages.ts): links under the service list.
  const [servicePages, setServicePages] = useState<{ name: string; url: string }[]>([]);
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/service-pages`)
      .then((d) => setServicePages(Array.isArray(d) ? d : []))
      .catch(() => setServicePages([]));
  }, [slug]);

  // Fetch the team
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/team`)
      .then((d) => setTeam(Array.isArray(d) ? d : []))
      .catch(() => setTeam([]));
  }, [slug]);

  // Fetch reviews
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/reviews`)
      .then((d) => setReviews(Array.isArray(d) ? d : []))
      .catch(() => setReviews([]));
  }, [slug]);

  // Fetch gallery (optional — gracefully skipped if endpoint doesn't exist)
  useEffect(() => {
    if (!slug) return;
    getPublicJson<any>(`/api/public/store/${slug}/gallery`)
      .then((d) => setGallery(Array.isArray(d) ? d : []))
      .catch(() => setGallery([]));
  }, [slug]);

  // Fetch backend AI-matched service reviews (one best review per service, keyed by service ID)
  useEffect(() => {
    if (!slug) return;
    getPublicJson<unknown>(`/api/public/store/${slug}/service-reviews`)
      .then((d: unknown) => {
        if (!d || typeof d !== "object" || Array.isArray(d)) {
          setServiceReviews({});
          return;
        }
        setServiceReviews(d as Record<string, ServiceReviewEntry>);
      })
      .catch(() => setServiceReviews({}));
  }, [slug]);

  // Pre-select on page load from URL param
  const preselectionApplied = useRef<number | null>(null);
  useEffect(() => {
    const id = Number(preselectedServiceId);
    if (!Number.isFinite(id) || id <= 0 || services.length === 0) return;
    if (preselectionApplied.current === id) return;
    preselectionApplied.current = id;
    const match = services.find((s) => Number(s.id) === id);
    if (match) chooseService(id);
  }, [preselectedServiceId, services]);

  const selectTime = () => {
    setMenuOpen(false);
    setCartOpen(false);
    setBookingOpen(true);
  };
  /** Book Now: on to the time with what's chosen; with nothing chosen, to the services. */
  const bookNow = () => {
    if (cart.length > 0) { selectTime(); return; }
    setMenuOpen(false);
    pickTab("services");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  /** One service from a link or a portfolio photo: its add-ons are offered first when it has any. */
  const chooseService = (id: number) => {
    const svc = services.find((x) => Number(x.id) === id);
    if (!svc || bookingOff) return;
    setCart([svc]);
    setCartAddons({});
    setServiceQty({});
    setExpandedId(svc.id);
    if (addonsFor(svc.id).length === 0) { setBookingOpen(true); return; }
    setActiveCategory("All");
    pickTab("services");
    requestAnimationFrame(() => document.getElementById(`service-${svc.id}`)?.scrollIntoView({ block: "center" }));
  };
  const finishedBooking = useRef(false);
  /** Only with both a place of their own and house calls does a service need to say where it's done. */
  const whereLabel = (svc: ServiceEntry) => {
    const own = (store as any).ownPlace;
    if (!(store as any).houseCalls || !own || own === "none") return null;
    return svc.offeredAt === "place" ? `${own === "home" ? "Home studio" : "In the salon"} only` : svc.offeredAt === "client" ? "House calls only" : null;
  };

  // Lightbox keyboard nav
  useEffect(() => {
    if (lightboxIndex === null) return;
    const total = gallery.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightboxIndex(null);
      if (e.key === "ArrowLeft")  setLightboxIndex((i) => i === null ? null : (i - 1 + total) % total);
      if (e.key === "ArrowRight") setLightboxIndex((i) => i === null ? null : (i + 1) % total);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightboxIndex, gallery.length]);

  // Categories
  const categories = useMemo(() => {
    // Use only the canonical service category names supplied by the API
    // (already filtered server-side). Do not invent extra labels from the
    // free-text `service.category` field — that causes duplicate/incorrect
    // items like "Spa Services" vs "Spa" to appear.
    const names = new Set<string>();
    for (const c of serviceCategories) {
      const n = (c?.name ?? "").trim();
      if (n) names.add(n);
    }
    const cats = Array.from(names);
    return ["All", ...cats];
  }, [services, serviceCategories]);

  const serviceCategoryNameById = useMemo(
    () => new Map(serviceCategories.map((category) => [category.id, category.name])),
    [serviceCategories],
  );

  const filteredServices = useMemo(() => {
    const categoryName = (service: ServiceEntry) =>
      serviceCategoryNameById.get(service.categoryId ?? -1) ?? service.category ?? "";
    // Nowhere to do it: a studio-only service with no studio, a house-call-only one with no house calls.
    const offered = services.filter((service) => !(service.offeredAt === "place" && (store as any).ownPlace === "none")
      && !(service.offeredAt === "client" && !(store as any).houseCalls));
    const visible = activeCategory === "All"
      ? offered
      : offered.filter((service) => categoryName(service) === activeCategory);
    const categoryOrder = new Map(serviceCategories.map((category, index) => [category.name, index]));

    return [...visible].sort((a, b) => {
      const categoryDifference =
        (categoryOrder.get(categoryName(a)) ?? Number.MAX_SAFE_INTEGER) -
        (categoryOrder.get(categoryName(b)) ?? Number.MAX_SAFE_INTEGER);
      if (categoryDifference !== 0) return categoryDifference;
      return a.name.localeCompare(b.name);
    });
  }, [services, serviceCategories, serviceCategoryNameById, activeCategory]);

  // Helper: look up the backend-matched review for a service (keyed by ID as number or string)
  function getServiceReview(serviceId: number): ServiceReviewEntry | null {
    return serviceReviews[serviceId] ?? serviceReviews[String(serviceId)] ?? null;
  }

  return { design, pages, pageFor, pageLinks, servicesTab, store, slug, preselectedStaffId, preselectedServiceId, services, setServices, serviceCategories, setServiceCategories, servicesLoading, setServicesLoading, reviews, setReviews, gallery, setGallery, portfolioLink, shop, setShop, knownClient, setKnownClient, shopView, setShopView, shopLinks, closeShop, tabFromHash, pickedTab, setPickedTab, tab, tabsTop, tabsY, pickTab, serviceReviews, setServiceReviews, team, setTeam, staffChoice, setStaffChoice, teamShown, priced, bookingOff, activeCategory, setActiveCategory, scrolled, setScrolled, menuOpen, setMenuOpen, bookingOpen, setBookingOpen, cart, setCart, barShown, cartAddons, setCartAddons, cartOpen, setCartOpen, expandedId, setExpandedId, addons, setAddons, serviceAddons, setServiceAddons, addonsFor, chosenFor, serviceQty, setServiceQty, qtyOf, inVisit, shownPrice, fromPrice, chosenAddons, cartTotal, cartFrom, cartCount, cartLines, visitPart, removeService, tooLong, setAddonQty, setServiceQuantity, expandService, tapService, toggleAddon, lightboxIndex, setLightboxIndex, photoLightbox, setPhotoLightbox, salonName, city, phoneHref, phoneDigits, phoneLabel, directionsUrl, isGoogleSourced, reviewCount, ratedReviews, avgRating, hours, cancelPolicyText, servicesBusy, setServicesBusy, servicesTry, setServicesTry, servicePages, setServicePages, preselectionApplied, selectTime, bookNow, chooseService, finishedBooking, whereLabel, categories, serviceCategoryNameById, filteredServices, getServiceReview };
}

export type SoloSite = ReturnType<typeof useSoloSite>;
export const SoloSiteContext = createContext<SoloSite | null>(null);
/** The Solo website's state, inside SoloSiteContext. */
export function useSite(): SoloSite {
  const site = useContext(SoloSiteContext);
  if (!site) throw new Error("useSite outside SoloSiteContext");
  return site;
}
