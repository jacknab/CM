import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Menu } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Sidebar } from "@/components/layout/Sidebar";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler, { passive: true });
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

/**
 * Renders a fixed header at the very top of the screen on mobile only.
 * Uses a JS breakpoint check so no inline-style vs CSS-class conflict can
 * accidentally show this on desktop.
 */
export function GlobalMobileHeader() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);

  // Don't render anything on desktop — no DOM node at all.
  if (!isMobile) return null;

  return (
    <>
      {/* Fixed header — mobile only */}
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          height: "56px",
          background: "#0f0f0f",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1rem",
        }}
      >
        {/* Certxa wordmark */}
        <span
          style={{
            fontFamily: "'Inter', 'Outfit', sans-serif",
            fontWeight: 800,
            fontSize: "1.25rem",
            letterSpacing: "-0.03em",
            color: "#FFFFFF",
            lineHeight: 1,
            cursor: "pointer",
          }}
          onClick={() => navigate("/manage")}
        >
          Certxa<span style={{ color: "#c5d42a" }}>.</span>
        </span>

        {/* Hamburger */}
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          style={{
            width: "36px",
            height: "36px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "10px",
            color: "rgba(255,255,255,0.75)",
            background: "rgba(255,255,255,0.06)",
            border: "none",
            cursor: "pointer",
          }}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>
      </header>

      {/* Slide-in nav sheet */}
      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="p-0 w-[220px] border-r-0" style={{ background: "#0f0f0f" }}>
          <Sidebar onLinkClick={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
