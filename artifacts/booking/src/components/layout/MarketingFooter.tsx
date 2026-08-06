const PLUM     = "#3B0764";
const PLUM_MID = "#5B21B6";

type FooterLink = { label: string; href: string; style?: { color?: string; fontWeight?: number } };
type FooterExtras = { title: string; links: FooterLink[] };

const COLS: Array<{
  title: string;
  titleStyle?: Record<string, string | number>;
  links: FooterLink[];
  extras?: FooterExtras;
}> = [
  {
    title: "Features",
    links: [
      { label: "Platform Overview",   href: "/overview" },
      { label: "Online Booking",      href: "/online-booking" },
      { label: "Client Management",   href: "/client-management" },
      { label: "Notifications",       href: "/client-notifications" },
      { label: "Payment Solutions",   href: "/payments" },
      { label: "Card Reader & POS",   href: "/card-reader-pos" },
      { label: "Google Business Profile", href: "/google-business-profile" },
      { label: "Client Reviews",          href: "/client-reviews" },
      { label: "Free Data Transfer",  href: "/data-transfer", style: { color: "#6366f1", fontWeight: 600 } },
    ],
  },
  {
    title: "Salon Types",
    links: [
      { label: "Hair Salon Software",     href: "/hair-salon-software" },
      { label: "Nail Salon Software",     href: "/nail-salon-software" },
      { label: "Barbershop Software",     href: "/barbershop-software" },
    ],
    extras: {
      title: "Compare",
      links: [
        { label: "Certxa vs GlossGenius", href: "/vs-glossgenius" },
        { label: "Certxa vs Vagaro",      href: "/vs-vagaro" },
      ],
    },
  },
  {
    title: "Company",
    links: [
      { label: "Success Stories", href: "/case-studies" },
      { label: "Blog",            href: "/blog" },
      { label: "Pricing",         href: "/pricing" },
      { label: "About Us",        href: "#" },
      { label: "Careers",         href: "#" },
      { label: "Help Centre",     href: "#" },
      { label: "Contact Us",      href: "/contact" },
      { label: "Staff Login",     href: "/staff-auth" },
    ],
  },
];

const PAYMENT_BADGES = ["Visa", "Mastercard", "Amex", "Apple Pay", "Google Pay", "PCI-DSS"];

export default function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ fontFamily: "'Inter', sans-serif" }}>

      {/* ── "Switching to Certxa" CTA banner ── */}
      <div style={{
        background: "#eef2f7",
        padding: "80px 24px",
        textAlign: "center",
      }}>
        <h2 style={{
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: "#0f172a",
          lineHeight: 1.15,
          margin: "0 auto 20px",
          maxWidth: 600,
        }}>
          Switching to Certxa has<br />never been easier
        </h2>
        <p style={{
          fontSize: "clamp(0.95rem, 2vw, 1.05rem)",
          color: "#475569",
          lineHeight: 1.65,
          maxWidth: 520,
          margin: "0 auto 36px",
        }}>
          Sign up for our free data transfer service, and we'll import all of your appointments,
          services, inventory, and client lists for you.
        </p>
        <a
          href="/data-transfer"
          style={{
            display: "inline-block",
            padding: "14px 32px",
            borderRadius: 9999,
            border: "1.5px solid #0f172a",
            background: "transparent",
            color: "#0f172a",
            fontSize: "0.95rem",
            fontWeight: 500,
            textDecoration: "none",
            transition: "background 0.18s, color 0.18s",
            cursor: "pointer",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = "#0f172a";
            (e.currentTarget as HTMLElement).style.color = "#fff";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = "transparent";
            (e.currentTarget as HTMLElement).style.color = "#0f172a";
          }}
        >
          Get your free data transfer
        </a>
      </div>

      {/* ── Dark footer body ── */}
      <div style={{
        background: "#0a0014",
        color: "#cbd5e1",
        padding: "72px 0 0",
      }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 28px" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "220px repeat(4, 1fr)",
          gap: "40px 24px",
        }}
          className="marketing-footer-grid">

          {/* Brand column */}
          <div>
            <a href="/overview" style={{
              fontWeight: 900, fontSize: 22, letterSpacing: "-0.04em",
              color: "#fff", textDecoration: "none", display: "inline-block", marginBottom: 14,
            }}>
              Certxa<span style={{ color: "#F59E0B" }}>.</span>
            </a>
            <p style={{ fontSize: ".82rem", lineHeight: 1.65, color: "#64748b", marginBottom: 20, maxWidth: 200 }}>
              The all-in-one platform that helps nail salon owners and nail technicians book more clients, get paid faster, and build a brand they love.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PAYMENT_BADGES.map(b => (
                <span key={b} style={{
                  display: "inline-block", padding: "3px 8px",
                  borderRadius: 4, border: "1px solid rgba(255,255,255,0.1)",
                  fontSize: ".68rem", fontWeight: 600, color: "#94a3b8",
                  letterSpacing: ".03em",
                }}>{b}</span>
              ))}
            </div>
          </div>

          {/* Nav columns */}
          {COLS.map(col => (
            <div key={col.title}>
              <p style={{
                fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase",
                letterSpacing: ".08em", color: "#94a3b8", marginBottom: 14,
                ...(col.titleStyle || {}),
              }}>
                {col.title}
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                {col.links.map(link => (
                  <li key={link.href + link.label}>
                    <a href={link.href} style={{
                      fontSize: ".8rem", color: "#64748b", textDecoration: "none",
                      transition: "color .15s",
                      ...(link.style || {}),
                    }}
                      onMouseEnter={e => { if (!link.style?.color) (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; }}
                      onMouseLeave={e => { if (!link.style?.color) (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
              {col.extras && (
                <>
                  <p style={{
                    fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase",
                    letterSpacing: ".08em", color: "#94a3b8", marginTop: 20, marginBottom: 10,
                  }}>
                    {col.extras.title}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {col.extras.links.map(link => (
                      <li key={link.href}>
                        <a href={link.href} style={{ fontSize: ".8rem", color: "#64748b", textDecoration: "none" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#64748b"; }}
                        >
                          {link.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: 12,
          borderTop: "1px solid rgba(255,255,255,0.07)",
          padding: "20px 0 28px",
          marginTop: 56,
        }}>
          <p style={{ fontSize: ".78rem", color: "#475569", margin: 0 }}>
            © {year} Certxa. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {[
              { label: "Privacy Policy",  href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
              { label: "About Us",         href: "/about" },
              { label: "Contact",          href: "/contact" },
            ].map(({ label, href }) => (
              <a key={label} href={href} style={{
                fontSize: ".78rem", color: "#475569", textDecoration: "none", transition: "color .15s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#e2e8f0"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#475569"; }}
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 960px) {
          .marketing-footer-grid {
            grid-template-columns: 1fr 1fr 1fr !important;
            gap: 32px 20px !important;
          }
        }
        @media (max-width: 600px) {
          .marketing-footer-grid {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 380px) {
          .marketing-footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
      </div>{/* end dark footer body */}
    </footer>
  );
}
