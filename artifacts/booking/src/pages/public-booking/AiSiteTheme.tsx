/**
 * A website designed by the AI Website Builder (owner, 2026-11-09; plans/ai-website-builder.md, Stage 3). Draws the
 * design spec (colours, letters, blocks with their words) and fills every fact from Certxa at view time: prices,
 * durations, hours, reviews, photos, phone, address. Pages: Home, Menu, Book; Book is the business's real booking
 * flow (`booking`, its normal design, in this site's accent colour). Opened today as a private preview
 * (?aiPreview=<token>); "Put it online" comes next.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowLeft, MapPin, Phone } from "lucide-react";

type Palette = { background: string; surface: string; text: string; muted: string; accent: string; accentText: string };
type Block = { type: string; [k: string]: any };
export type AiSpec = { theme: { palette: Palette; fonts: { heading: string; body: string }; corners: "square" | "soft" | "round"; headingCase: "normal" | "upper" };
  tagline: string; home: Block[]; menu: Block[]; summary: string };
export type AiFacts = {
  business: { name: string; kind: string; phone: string | null; area: string | null; streetAddress: string | null; about: string | null; houseCalls: { radiusMiles: number | null; fee: number | null } | null };
  services: { name: string; category: string | null; price: number | null; minutes: number | null }[];
  hours: { day: string; open: string | null; close: string | null }[];
  team: { name: string; bio: string | null }[];
  reviews: { rating: number; text: string; service: string | null }[];
  rating: { average: number; count: number } | null;
  photoUrls: { url: string; caption: string | null }[];
};

const FONT_QUERY: Record<string, string> = {
  "Inter": "Inter:wght@400;600;700", "DM Sans": "DM+Sans:wght@400;600;700", "Poppins": "Poppins:wght@400;600;700", "Montserrat": "Montserrat:wght@400;600;700",
  "Nunito": "Nunito:wght@400;700", "Space Grotesk": "Space+Grotesk:wght@400;600;700", "Playfair Display": "Playfair+Display:wght@400;700",
  "DM Serif Display": "DM+Serif+Display", "Fraunces": "Fraunces:wght@400;700", "Cormorant Garamond": "Cormorant+Garamond:wght@400;600;700",
  "Lora": "Lora:wght@400;600;700", "Bebas Neue": "Bebas+Neue", "Oswald": "Oswald:wght@400;600;700", "Archivo Black": "Archivo+Black",
  "Abril Fatface": "Abril+Fatface", "Pacifico": "Pacifico",
};
const SERIF = ["Playfair Display", "DM Serif Display", "Fraunces", "Cormorant Garamond", "Lora", "Abril Fatface"];
const fontStack = (f: string) => `'${f}', ${SERIF.includes(f) ? "Georgia, serif" : "system-ui, sans-serif"}`;
const money = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const minutesLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const time12 = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h >= 12 ? "pm" : "am"}`; };
/** "(720) 243-6886" from however the number is stored. */
const prettyPhone = (raw: string) => { const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, ""); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw; };
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type Page = "home" | "menu" | "book";

/** Loads the design's two Google fonts. */
export function useSiteFonts(spec: AiSpec) {
  useEffect(() => {
    const families = [...new Set([spec.theme.fonts.heading, spec.theme.fonts.body])].map((f) => FONT_QUERY[f]).filter(Boolean);
    if (!families.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [spec.theme.fonts.heading, spec.theme.fonts.body]);
}
export const aiFontStack = (f: string) => fontStack(f);

/** The design's Home blocks, for the foundation's About tab. `onBook` opens the booking (Services tab). */
export function AiBlocks({ spec, facts, onBook }: { spec: AiSpec; facts: AiFacts; onBook: () => void }) {
  const p = spec.theme.palette;
  const ctx: Ctx = { p, radius: spec.theme.corners === "square" ? 4 : spec.theme.corners === "round" ? 28 : 14, facts, book: onBook,
    heading: { fontFamily: fontStack(spec.theme.fonts.heading), textTransform: spec.theme.headingCase === "upper" ? "uppercase" : "none", letterSpacing: spec.theme.headingCase === "upper" ? "-0.01em" : "-0.015em" } as CSSProperties };
  return <>{spec.home.map((b, i) => <BlockView key={i} block={b} ctx={ctx} first={i === 0} />)}</>;
}

export default function AiSiteTheme({ spec, facts, booking, preview }: { spec: AiSpec; facts: AiFacts; booking: ReactNode; preview?: boolean }) {
  const [page, setPage] = useState<Page>(() => (typeof window !== "undefined" && window.location.hash === "#book" ? "book" : typeof window !== "undefined" && window.location.hash === "#menu" ? "menu" : "home"));
  const p = spec.theme.palette;
  const radius = spec.theme.corners === "square" ? 4 : spec.theme.corners === "round" ? 28 : 14;
  // The two Google fonts this design uses.
  useEffect(() => {
    const families = [...new Set([spec.theme.fonts.heading, spec.theme.fonts.body])].map((f) => FONT_QUERY[f]).filter(Boolean);
    if (!families.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [spec.theme.fonts.heading, spec.theme.fonts.body]);
  // The booking app pads every phone page by 56px for its fixed header (index.css). This site has its own header, so
  // its Home and Menu pages don't need it; the Book page (the normal booking design) does.
  useEffect(() => {
    document.body.style.paddingTop = page === "book" ? "" : "0px";
    return () => { document.body.style.paddingTop = ""; };
  }, [page]);
  const go = (next: Page) => { setPage(next); window.location.hash = next === "home" ? "" : next; window.scrollTo({ top: 0 }); };

  const ctx = { p, radius, facts, heading: { fontFamily: fontStack(spec.theme.fonts.heading), textTransform: spec.theme.headingCase === "upper" ? "uppercase" : "none", letterSpacing: spec.theme.headingCase === "upper" ? "-0.01em" : "-0.015em" } as CSSProperties, book: () => go("book") };
  const banner = preview ? (
    <div className="sticky top-0 z-[60] w-full px-4 py-2 text-center text-sm font-medium" style={{ background: "#1C1650", color: "#FFFFFF" }} data-testid="ai-preview-banner">
      Preview · only you can see this until you put it online
    </div>
  ) : null;

  if (page === "book") {
    return (
      <div>
        {banner}
        <div className="flex items-center gap-2 px-4 py-3" style={{ background: p.background, color: p.text, fontFamily: fontStack(spec.theme.fonts.body) }}>
          <button type="button" onClick={() => go("home")} className="flex items-center gap-2 text-base font-semibold" data-testid="ai-back-home"><ArrowLeft className="h-5 w-5" /> {facts.business.name}</button>
        </div>
        {booking}
      </div>
    );
  }

  const blocks = page === "home" ? spec.home : spec.menu;
  return (
    <div className="min-h-screen" style={{ background: p.background, color: p.text, fontFamily: fontStack(spec.theme.fonts.body) }} data-testid="ai-site">
      {banner}
      <header className="sticky top-0 z-50 border-b" style={{ background: p.background, borderColor: `${p.muted}33`, top: preview ? 36 : 0 }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <button type="button" onClick={() => go("home")} className="truncate text-left text-lg font-bold" style={ctx.heading}>{facts.business.name}</button>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <button type="button" onClick={() => go("menu")} style={{ color: page === "menu" ? p.accent : p.text }} data-testid="ai-nav-menu">Menu</button>
            <button type="button" onClick={() => go("book")} className="px-4 py-2" style={{ background: p.accent, color: p.accentText, borderRadius: radius }} data-testid="ai-nav-book">Book</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        {blocks.map((b, i) => <BlockView key={`${page}-${i}`} block={b} ctx={ctx} first={i === 0} />)}
      </main>
      <footer className="border-t px-4 py-8 text-center text-sm" style={{ borderColor: `${p.muted}33`, color: p.muted }}>
        <p className="font-semibold" style={{ color: p.text }}>{facts.business.name}</p>
        {facts.business.phone ? <p className="mt-1"><a href={`tel:${facts.business.phone}`} style={{ color: p.text }}>{prettyPhone(facts.business.phone)}</a></p> : null}
        <p className="mt-1">{facts.business.streetAddress ?? facts.business.area ?? ""}</p>
        <p className="mt-3 text-xs">Powered by Certxa</p>
      </footer>
    </div>
  );
}

type Ctx = { p: Palette; radius: number; facts: AiFacts; heading: CSSProperties; book: () => void };

function Button({ ctx, children }: { ctx: Ctx; children: ReactNode }) {
  return <button type="button" onClick={ctx.book} className="mt-6 w-full px-6 py-4 text-lg font-bold sm:w-auto" style={{ background: ctx.p.accent, color: ctx.p.accentText, borderRadius: ctx.radius }}>{children}</button>;
}
function Section({ ctx, title, children, surface }: { ctx: Ctx; title?: string; children: ReactNode; surface?: boolean }) {
  return (
    <section className="mt-10" style={surface ? { background: ctx.p.surface, borderRadius: ctx.radius, padding: "24px 20px" } : undefined}>
      {title ? <h2 className="mb-4 text-2xl font-bold sm:text-3xl" style={ctx.heading}>{title}</h2> : null}
      {children}
    </section>
  );
}

function openToday(facts: AiFacts): string | null {
  const today = facts.hours.find((h) => h.day === DAYS[new Date().getDay()]);
  return today?.open && today.close ? `Open today ${time12(today.open)}–${time12(today.close)}` : "Closed today";
}

function BlockView({ block: b, ctx, first }: { block: Block; ctx: Ctx; first: boolean }) {
  const { p, facts } = ctx;
  switch (b.type) {
    case "hero":
      return (
        <section className={first ? "pt-10 sm:pt-16" : "mt-10"} style={b.variant === "centered" ? { textAlign: "center" } : undefined}>
          {b.showOpenNow ? <p className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: p.accent }}>{openToday(facts)}</p> : null}
          {b.eyebrow ? <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: p.muted }}>{b.eyebrow}</p> : null}
          <h1 className={b.variant === "big-name" ? "text-5xl font-bold leading-[1.02] sm:text-7xl" : "text-4xl font-bold leading-tight sm:text-6xl"} style={ctx.heading}>{b.headline}</h1>
          {b.subline ? <p className="mt-4 max-w-2xl text-lg sm:text-xl" style={{ color: p.muted, marginInline: b.variant === "centered" ? "auto" : undefined }}>{b.subline}</p> : null}
          <Button ctx={ctx}>{b.button}</Button>
        </section>
      );
    case "priceList": {
      const wanted = (b.categories as string[] | undefined)?.map((c) => c.toLowerCase());
      let list = facts.services.filter((s) => !wanted?.length || (s.category && wanted.includes(s.category.toLowerCase())));
      if (b.limit) list = list.slice(0, b.limit);
      const groups = [...new Set(list.map((s) => s.category ?? "Services"))];
      return (
        <Section ctx={ctx} title={b.title} surface={b.variant !== "cards"}>
          {b.intro ? <p className="mb-5 text-base" style={{ color: p.muted }}>{b.intro}</p> : null}
          {groups.map((g) => (
            <div key={g} className="mb-6 last:mb-0">
              {groups.length > 1 ? <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: p.accent }}>{g}</h3> : null}
              <div className={b.variant === "cards" ? "grid gap-3 sm:grid-cols-2" : "space-y-2"}>
                {list.filter((s) => (s.category ?? "Services") === g).map((s) => (
                  <div key={s.name} className={b.variant === "cards" ? "p-4" : "flex items-baseline gap-3"} style={b.variant === "cards" ? { background: p.surface, borderRadius: ctx.radius } : undefined}>
                    <span className="text-base font-semibold">{s.name}{s.minutes ? <span className="ml-2 text-sm font-normal" style={{ color: p.muted }}>{minutesLabel(s.minutes)}</span> : null}</span>
                    {b.variant === "menu-board" ? <span className="min-w-[24px] flex-1 border-b border-dotted" style={{ borderColor: `${p.muted}66` }} /> : <span className="flex-1" />}
                    <span className={b.variant === "cards" ? "mt-1 block text-lg font-bold" : "text-base font-bold"} style={{ color: p.accent }}>{s.price != null ? money(s.price) : "Ask"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <Button ctx={ctx}>Book now</Button>
        </Section>
      );
    }
    case "hours":
      return (
        <Section ctx={ctx} title={b.title} surface>
          {b.variant === "week-strip" ? (
            <div className="grid grid-cols-7 gap-1 text-center">
              {facts.hours.map((h) => (
                <div key={h.day} className="py-2" style={{ borderRadius: 8, background: h.day === DAYS[new Date().getDay()] ? p.accent : "transparent", color: h.day === DAYS[new Date().getDay()] ? p.accentText : p.text }}>
                  <div className="text-xs font-bold uppercase">{h.day.slice(0, 3)}</div>
                  <div className="mt-1 text-[11px] leading-tight sm:text-sm">{h.open && h.close ? <>{time12(h.open)}<br />{time12(h.close)}</> : "Closed"}</div>
                </div>
              ))}
            </div>
          ) : (
            <dl className="max-w-sm space-y-1.5">
              {facts.hours.map((h) => (
                <div key={h.day} className="flex justify-between gap-6"><dt>{h.day}</dt><dd style={{ color: h.open ? p.text : p.muted }}>{h.open && h.close ? `${time12(h.open)} – ${time12(h.close)}` : "Closed"}</dd></div>
              ))}
            </dl>
          )}
          {b.note ? <p className="mt-4 text-sm" style={{ color: p.muted }}>{b.note}</p> : null}
        </Section>
      );
    case "featuredPerson":
      return (
        <Section ctx={ctx} title={b.title} surface>
          <div className="flex items-start gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center text-xl font-bold" style={{ background: p.accent, color: p.accentText, borderRadius: 999 }}>{String(b.name).slice(0, 1)}</div>
            <div><p className="text-xl font-bold" style={ctx.heading}>{b.name}</p><p className="mt-1 text-base" style={{ color: p.muted }}>{b.text}</p></div>
          </div>
        </Section>
      );
    case "reviews":
      return (
        <Section ctx={ctx} title={b.title}>
          {facts.rating ? <p className="mb-4 text-base font-semibold" style={{ color: p.accent }}>{`★ ${facts.rating.average} · ${facts.rating.count} ${facts.rating.count === 1 ? "review" : "reviews"}`}</p> : null}
          {b.variant === "themes" && b.themes?.length ? (
            <ul className="flex flex-wrap gap-2">{(b.themes as string[]).map((t) => <li key={t} className="px-4 py-2 text-base" style={{ background: p.surface, borderRadius: 999 }}>{t}</li>)}</ul>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {facts.reviews.slice(0, 4).map((r, i) => (
                <blockquote key={i} className="p-5 text-base italic" style={{ background: p.surface, borderRadius: ctx.radius }}>
                  “{r.text}”{r.service ? <footer className="mt-2 text-sm not-italic" style={{ color: p.muted }}>{r.service}</footer> : null}
                </blockquote>
              ))}
            </div>
          )}
        </Section>
      );
    case "location": {
      const where = facts.business.streetAddress ?? facts.business.area;
      return (
        <Section ctx={ctx} title={b.title} surface>
          <p className="flex items-start gap-2 text-lg font-semibold"><MapPin className="mt-1 h-5 w-5 shrink-0" style={{ color: p.accent }} />{where}</p>
          {b.text ? <p className="mt-2 text-base" style={{ color: p.muted }}>{b.text}</p> : null}
          {facts.business.streetAddress ? <a className="mt-3 inline-block text-base font-semibold underline" style={{ color: p.accent }} target="_blank" rel="noopener noreferrer"
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(facts.business.streetAddress)}`}>Get directions</a> : null}
          {facts.business.phone ? <a className="mt-3 flex items-center gap-2 text-base font-semibold" href={`tel:${facts.business.phone}`} style={{ color: p.text }}><Phone className="h-4 w-4" />{prettyPhone(facts.business.phone)}</a> : null}
        </Section>
      );
    }
    case "houseCalls":
      return (
        <Section ctx={ctx} title={b.title} surface>
          <p className="text-base">{b.text}</p>
          {facts.business.houseCalls ? <p className="mt-2 text-sm" style={{ color: p.muted }}>
            {[facts.business.houseCalls.radiusMiles ? `Within ${facts.business.houseCalls.radiusMiles} miles` : null, facts.business.houseCalls.fee ? `${money(facts.business.houseCalls.fee)} travel fee` : null].filter(Boolean).join(" · ")}</p> : null}
        </Section>
      );
    case "about":
      return <Section ctx={ctx} title={b.title}><p className="max-w-3xl whitespace-pre-line text-lg leading-relaxed">{b.text}</p></Section>;
    case "gallery":
      return facts.photoUrls.length ? (
        <Section ctx={ctx} title={b.title}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facts.photoUrls.slice(0, 9).map((ph) => <img key={ph.url} src={ph.url} alt={ph.caption ?? ""} loading="lazy" className="aspect-square w-full object-cover" style={{ borderRadius: Math.min(ctx.radius, 16) }} />)}
          </div>
        </Section>
      ) : null;
    case "faq":
      return (
        <Section ctx={ctx} title={b.title}>
          {(b.items as { q: string; a: string }[]).map((it) => (
            <details key={it.q} className="mb-2 px-4 py-3" style={{ background: p.surface, borderRadius: ctx.radius }}>
              <summary className="cursor-pointer text-base font-semibold">{it.q}</summary>
              <p className="mt-2 text-base" style={{ color: p.muted }}>{it.a}</p>
            </details>
          ))}
        </Section>
      );
    case "callToAction":
      return (
        <section className="mt-12 px-6 py-10 text-center" style={{ background: p.accent, color: p.accentText, borderRadius: ctx.radius }}>
          <h2 className="text-3xl font-bold sm:text-4xl" style={ctx.heading}>{b.headline}</h2>
          {b.text ? <p className="mx-auto mt-3 max-w-xl text-lg opacity-90">{b.text}</p> : null}
          <button type="button" onClick={ctx.book} className="mt-6 px-8 py-4 text-lg font-bold" style={{ background: p.accentText, color: p.accent, borderRadius: ctx.radius }}>{b.button}</button>
        </section>
      );
    default:
      return null;
  }
}

/**
 * Loads the AI site and shows it: a private preview with ?aiPreview=<token>, else the version that is online. The Book
 * page is the business's normal design in the site's accent.
 */
export function AiSitePreview({ slug, token, booking }: { slug: string; token?: string | null; booking: (accent: string) => ReactNode }) {
  const [data, setData] = useState<{ spec: AiSpec; facts: AiFacts } | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    fetch(`/api/public/store/${encodeURIComponent(slug)}/ai-site${token ? `?preview=${encodeURIComponent(token)}` : ""}`)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error ?? "This preview could not be opened."); setData(j); })
      .catch((e) => setFailed(e?.message ?? "This preview could not be opened."));
  }, [slug, token]);
  const bookingView = useMemo(() => (data ? booking(data.spec.theme.palette.accent) : null), [data, booking]);
  if (failed) return <div className="flex min-h-screen items-center justify-center p-6 text-center text-gray-700">{failed}</div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center text-gray-500">{token ? "Loading your preview…" : "Loading…"}</div>;
  return <AiSiteTheme spec={data.spec} facts={data.facts} booking={bookingView} preview={!!token} />;
}
