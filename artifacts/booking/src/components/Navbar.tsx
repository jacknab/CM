import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";

interface NavbarProps {
  variant?: "marketing" | "wizard";
}

export default function Navbar({ variant = "marketing" }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-500"
      style={{
        background: scrolled
          ? "rgba(5, 12, 24, 0.80)"
          : "rgba(5, 12, 24, 0.45)",
        backdropFilter: "blur(28px) saturate(180%)",
        WebkitBackdropFilter: "blur(28px) saturate(180%)",
        borderBottom: scrolled
          ? "1px solid rgba(255,255,255,0.09)"
          : "1px solid rgba(255,255,255,0.05)",
        boxShadow: scrolled ? "0 8px 40px rgba(0,0,0,0.3)" : "none",
      }}
    >
      <div
        className="absolute top-0 left-0 right-0 h-px pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(0,212,170,0.55) 30%, rgba(255,255,255,0.12) 50%, rgba(0,212,170,0.55) 70%, transparent 100%)",
          opacity: scrolled ? 0.7 : 0.4,
          transition: "opacity 0.5s",
        }}
      />

      <div className="max-w-7xl mx-auto px-5 sm:px-8 lg:px-12">
        <div className="flex items-center justify-between h-[68px]">

          {variant === "wizard" ? (
            <Link
              to="/"
              className="flex items-center gap-1.5 text-white/45 hover:text-white/80 transition-colors duration-200 text-sm font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
          ) : (
            <Link to="/auth" className="flex items-center gap-3 group">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{
                    background: "radial-gradient(circle, rgba(0,212,170,0.3) 0%, transparent 70%)",
                    filter: "blur(10px)",
                  }}
                />
                <img
                  src="/web-app.png"
                  alt="Certxa"
                  className="relative w-8 h-8 rounded-xl shadow-md"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
              <span
                className="text-white font-black text-[17px]"
                style={{ letterSpacing: "-0.025em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Certxa
              </span>
            </Link>
          )}

          {variant === "wizard" && (
            <Link to="/auth" className="flex items-center gap-2.5 absolute left-1/2 -translate-x-1/2">
              <img
                src="/web-app.png"
                alt="Certxa"
                className="w-7 h-7 rounded-lg shadow"
                onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <span
                className="text-white font-black text-base"
                style={{ letterSpacing: "-0.02em", fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Certxa
              </span>
            </Link>
          )}

          <div className="flex items-center gap-1.5">
            <Link to="/auth">
              <button
                className="px-4 py-2 rounded-lg text-sm font-medium text-white/55 hover:text-white hover:bg-white/[0.06] transition-all duration-200"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Log in
              </button>
            </Link>
          </div>

        </div>
      </div>
    </nav>
  );
}
