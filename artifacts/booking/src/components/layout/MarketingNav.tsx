import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Menu, X, ChevronDown } from "lucide-react";

const PLUM      = "#3B0764";
const PLUM_MID  = "#5B21B6";
const GOLD      = "#F59E0B";
const GRAD_PLUM = "linear-gradient(135deg, #3B0764 0%, #6D28D9 100%)";

interface DropdownItem {
  label: string;
  href: string;
  dot?: string;
  bold?: boolean;
}

interface NavGroup {
  section?: string;
  items: DropdownItem[];
}

interface NavItem {
  label: string;
  href?: string;
  style?: React.CSSProperties;
  dropdown?: NavGroup[];
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "How It Works",
    dropdown: [
      {
        section: "Client Experience",
        items: [
          { label: "Platform Overview",           href: "/overview" },
          { label: "Online Booking",              href: "/online-booking" },
          { label: "Client Management",           href: "/client-management" },
          { label: "Client Notifications",        href: "/client-notifications" },
          { label: "Self-Service Check-in Kiosk", href: "/checkin-kiosk", dot: "#10b981" },
        ],
      },
      {
        section: "Revenue & Intelligence",
        items: [
          { label: "Revenue Intelligence", href: "/revenue-intelligence", dot: "#a78bfa", bold: true },
        ],
      },
      {
        section: "AI Features",
        items: [
          { label: "Autumn AI Receptionist", href: "/autumn", dot: "#f59e0b", bold: true },
        ],
      },
      {
        section: "Build Your Brand",
        items: [
          { label: "Google Business Profile", href: "/google-business-profile" },
          { label: "Client Reviews",          href: "/client-reviews" },
          { label: "Launchit! Builder",   href: "/launchsite" },
        ],
      },
    ],
  },
  {
    label: "Pricing",
    dropdown: [
      {
        items: [
          { label: "Pricing Plans",      href: "/pricing" },
          { label: "Payments & Billing", href: "/payments", dot: "#635bff" },
        ],
      },
    ],
  },
  {
    label: "Resources",
    dropdown: [
      {
        items: [
          { label: "Blog",        href: "/blog" },
          { label: "Help Centre", href: "#" },
          { label: "Contact Us",  href: "/contact" },
        ],
      },
    ],
  },
];

export default function MarketingNav({ hideActions = false, authActions = false }: { hideActions?: boolean; authActions?: boolean }) {
  const [mobileOpen, setMobileOpen]         = useState(false);
  const [openDropdown, setOpenDropdown]     = useState<string | null>(null);
  const [mobileDropdown, setMobileDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled]             = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&display=swap";
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setMobileDropdown(null);
  }, [location.pathname]);

  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenDropdown(null), 150);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  return (
    <nav
      style={{
        position: "sticky", top: 0, zIndex: 200,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(229,231,235,0.7)",
        boxShadow: scrolled ? "0 4px 24px rgba(59,7,100,0.10)" : "none",
        transition: "box-shadow .3s ease",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "0 28px" }}>
        <div style={{ display: "flex", alignItems: "center", height: 70, gap: 0 }}>

          {/* Logo */}
          <a href="/overview" style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 700, fontSize: "1.55rem", letterSpacing: "-0.02em",
            color: PLUM, textDecoration: "none", flexShrink: 0, marginRight: 28,
          }}>
            Certxa<span style={{ color: GOLD }}>.</span>
          </a>

          {/* Desktop nav links */}
          <ul style={{
            display: "flex", alignItems: "center", gap: 2,
            listStyle: "none", margin: 0, padding: 0, flex: 1,
          }}
            className="marketing-nav-links">

            {NAV_ITEMS.map(item => (
              <li key={item.label} style={{ position: "relative" }}
                onMouseEnter={() => { if (item.dropdown) { cancelClose(); setOpenDropdown(item.label); } }}
                onMouseLeave={() => { if (item.dropdown) scheduleClose(); }}
              >
                {item.dropdown ? (
                  <button
                    onClick={() => setOpenDropdown(openDropdown === item.label ? null : item.label)}
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      padding: "6px 10px", borderRadius: 6,
                      fontSize: ".875rem", fontWeight: 500, color: "#374151",
                      background: "none", border: "none", cursor: "pointer",
                      transition: "color .15s, background .15s",
                      ...(item.style || {}),
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).closest("button")!.style.background = "#f5f3ff"; }}
                    onMouseLeave={e => { (e.target as HTMLElement).closest("button")!.style.background = "none"; }}
                  >
                    {item.label}
                    <ChevronDown size={13} style={{
                      opacity: .55,
                      transform: openDropdown === item.label ? "rotate(180deg)" : "rotate(0)",
                      transition: "transform .2s",
                    }} />
                  </button>
                ) : (
                  <a href={item.href} style={{
                    display: "flex", alignItems: "center",
                    padding: "6px 10px", borderRadius: 6,
                    fontSize: ".875rem", fontWeight: 500, color: "#374151",
                    textDecoration: "none", transition: "color .15s, background .15s",
                    ...(item.style || {}),
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#f5f3ff"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "none"; }}
                  >
                    {item.label}
                  </a>
                )}

                {/* Dropdown panel */}
                {item.dropdown && openDropdown === item.label && (
                  <div
                    onMouseEnter={cancelClose}
                    onMouseLeave={scheduleClose}
                    style={{
                      position: "absolute", top: "calc(100% + 8px)", left: 0,
                      background: "#fff", borderRadius: 12, minWidth: 230,
                      boxShadow: "0 8px 40px rgba(59,7,100,0.13), 0 0 0 1px rgba(229,231,235,.8)",
                      padding: "10px 0", zIndex: 200,
                      animation: "ddFadeIn .15s ease",
                    }}>
                    <style>{`@keyframes ddFadeIn { from { opacity:0; transform:translateY(6px) } to { opacity:1; transform:none } }`}</style>
                    {item.dropdown.map((group, gi) => (
                      <div key={gi}>
                        {group.section && (
                          <p style={{
                            fontSize: ".7rem", fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: ".08em", color: "#9ca3af",
                            padding: gi === 0 ? "8px 18px 4px" : "14px 18px 4px",
                          }}>{group.section}</p>
                        )}
                        {group.items.map(link => (
                          <a key={link.href + link.label} href={link.href} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "9px 18px", fontSize: ".855rem",
                            fontWeight: link.bold ? 600 : 500,
                            color: "#374151", textDecoration: "none",
                            transition: "background .12s, color .12s",
                          }}
                            onMouseEnter={e => {
                              (e.currentTarget as HTMLElement).style.background = "#f5f3ff";
                              (e.currentTarget as HTMLElement).style.color = PLUM_MID;
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = "none";
                              (e.currentTarget as HTMLElement).style.color = "#374151";
                            }}
                          >
                            <span style={{
                              width: 5, height: 5, borderRadius: "50%",
                              background: link.dot || PLUM_MID,
                              flexShrink: 0, opacity: link.dot ? 1 : .45,
                            }} />
                            {link.label}
                          </a>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Desktop CTA — Log In + Start Free Trial (matches PHP nav) */}
          {(!hideActions || authActions) && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: "auto" }}
              className="marketing-nav-actions">
              {authActions && (
                <a href="/auth?mode=login" style={{
                  padding: "9px 21px", borderRadius: 50, fontSize: ".84rem",
                  fontWeight: 600, color: "#374151", textDecoration: "none",
                  background: "#fff", border: "1px solid #d1d5db",
                  transition: "background .15s, border-color .15s",
                }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.background = "#f9fafb";
                    (e.currentTarget as HTMLElement).style.borderColor = "#9ca3af";
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.background = "#fff";
                    (e.currentTarget as HTMLElement).style.borderColor = "#d1d5db";
                  }}
                >
                  Log In
                </a>
              )}
              <a href="/auth?mode=register" style={{
                padding: "10px 22px", borderRadius: 50, fontSize: ".84rem",
                fontWeight: 600, color: "#fff", textDecoration: "none",
                background: GRAD_PLUM,
                boxShadow: "0 3px 16px rgba(59,7,100,.32)",
                transition: "transform .15s, box-shadow .15s",
              }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(59,7,100,.44)";
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = "none";
                  (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 16px rgba(59,7,100,.32)";
                }}
              >
                Start Free Trial
              </a>
            </div>
          )}

          {/* Hamburger */}
          <button
            onClick={() => setMobileOpen(v => !v)}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            style={{
              display: "none", alignItems: "center", justifyContent: "center",
              width: 44, height: 44, borderRadius: 8, border: "none",
              background: mobileOpen ? "#f5f3ff" : "none", cursor: "pointer",
              color: PLUM, flexShrink: 0,
            }}
            className="marketing-hamburger"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* ── Mobile menu ── */}
      {mobileOpen && (
        <div style={{
          background: "#fff",
          borderTop: "1px solid #f3f4f6",
          padding: "8px 28px 20px",
          maxHeight: "calc(100vh - 68px)",
          overflowY: "auto",
        }}>
          {NAV_ITEMS.map(item => (
            <div key={item.label}>
              {item.dropdown ? (
                <>
                  <button
                    onClick={() => setMobileDropdown(mobileDropdown === item.label ? null : item.label)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      width: "100%", padding: "13px 0",
                      borderBottom: "1px solid rgba(229,231,235,.6)",
                      background: "none", border: "none",
                      borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "rgba(229,231,235,.6)",
                      fontSize: ".9rem", fontWeight: 600, color: "#1f2937", cursor: "pointer",
                    }}
                  >
                    {item.label}
                    <ChevronDown size={14} style={{
                      opacity: .5,
                      transform: mobileDropdown === item.label ? "rotate(180deg)" : "none",
                      transition: "transform .2s",
                    }} />
                  </button>
                  {mobileDropdown === item.label && (
                    <div style={{ paddingLeft: 14, paddingBottom: 8 }}>
                      {item.dropdown.flatMap(g => g.items).map(link => (
                        <a key={link.href + link.label} href={link.href} style={{
                          display: "block", padding: "10px 4px",
                          fontSize: ".855rem", fontWeight: link.bold ? 600 : 500,
                          color: "#6b7280", textDecoration: "none",
                          borderBottom: "1px solid rgba(229,231,235,.35)",
                        }}>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <a href={item.href} style={{
                  display: "block", padding: "13px 0",
                  borderBottom: "1px solid rgba(229,231,235,.6)",
                  fontSize: ".9rem", fontWeight: 600, color: "#1f2937",
                  textDecoration: "none",
                }}>
                  {item.label}
                </a>
              )}
            </div>
          ))}

          {(!hideActions || authActions) && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {authActions && (
                <a href="/auth?mode=login" style={{
                  display: "block", textAlign: "center", padding: "13px 20px",
                  borderRadius: 50, fontSize: ".9rem", fontWeight: 600,
                  color: "#374151", textDecoration: "none",
                  background: "#fff", border: "1px solid #d1d5db",
                }}>
                  Log In
                </a>
              )}
              <a href="/auth?mode=register" style={{
                display: "block", textAlign: "center", padding: "14px 20px",
                borderRadius: 50, fontSize: ".9rem", fontWeight: 700,
                color: "#fff", textDecoration: "none",
                background: `linear-gradient(135deg, ${PLUM_MID} 0%, ${PLUM} 100%)`,
              }}>
                Start Free Trial
              </a>
            </div>
          )}
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .marketing-nav-links  { display: none !important; }
          .marketing-nav-actions { display: none !important; }
          .marketing-hamburger  { display: flex !important; }
        }
      `}</style>
    </nav>
  );
}
