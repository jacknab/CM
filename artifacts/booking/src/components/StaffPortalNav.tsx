import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  Menu as MenuIcon,
  QrCode,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { QRScannerModal } from "@/components/QRScannerModal";

const LEFT_TABS = [
  { id: "dashboard", Icon: LayoutDashboard, label: "Home",     path: "/staff-dashboard" },
  { id: "calendar",  Icon: CalendarDays,    label: "Calendar", path: "/staff-calendar"  },
] as const;

const RIGHT_TABS = [
  { id: "overview", Icon: BarChart3,  label: "Overview", path: "/staff-overview" },
  { id: "menu",     Icon: MenuIcon,   label: "Menu",     path: "/staff-menu"     },
] as const;

const NAV_H = 64;
const NOTCH_R = 38;   // half-width of notch (px)
const NOTCH_D = 22;   // depth of arch curve
const LEAD    = 14;   // bezier lead-in width

function buildPath(w: number) {
  if (w === 0) return "";
  const cx = w / 2;
  // Smooth U-shaped notch using cubic bezier curves
  return [
    `M 0 0`,
    `L ${cx - NOTCH_R - LEAD} 0`,
    `C ${cx - NOTCH_R} 0 ${cx - NOTCH_R} ${NOTCH_D} ${cx} ${NOTCH_D}`,
    `C ${cx + NOTCH_R} ${NOTCH_D} ${cx + NOTCH_R} 0 ${cx + NOTCH_R + LEAD} 0`,
    `L ${w} 0`,
    `V ${NAV_H}`,
    `H 0`,
    `Z`,
  ].join(" ");
}

export function StaffPortalNav() {
  const { pathname } = useLocation();
  const navigate      = useNavigate();
  const [scannerOpen, setScannerOpen] = useState(false);
  const containerRef  = useRef<HTMLDivElement>(null);
  const [navWidth, setNavWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      setNavWidth(entries[0].contentRect.width);
    });
    ro.observe(el);
    setNavWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  const safeBottom = "env(safe-area-inset-bottom, 0px)";

  return (
    <>
      {/* Outer wrapper — overflow-visible so the FAB can protrude upward */}
      <div
        ref={containerRef}
        className="flex-shrink-0 relative overflow-visible z-50"
        style={{ height: `calc(${NAV_H}px + ${safeBottom})` }}
      >
        {/* SVG notch background */}
        {navWidth > 0 && (
          <svg
            width={navWidth}
            height={NAV_H}
            viewBox={`0 0 ${navWidth} ${NAV_H}`}
            className="absolute top-0 left-0 drop-shadow-[0_-1px_0_rgba(0,0,0,0.06)]"
            style={{ overflow: "visible" }}
          >
            <path d={buildPath(navWidth)} fill="white" />
          </svg>
        )}

        {/* Tab row */}
        <div
          className="absolute inset-x-0 top-0 flex items-stretch"
          style={{ height: `${NAV_H}px`, paddingBottom: safeBottom }}
        >
          {/* Left tabs */}
          {LEFT_TABS.map(({ id, Icon, label, path }) => {
            const active = pathname === path || pathname.startsWith(path + "/");
            return (
              <button
                key={id}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] pb-1 select-none active:opacity-50 transition-opacity relative"
                onClick={() => navigate(path)}
              >
                {active && (
                  <span className="absolute top-0 inset-x-0 flex justify-center">
                    <span className="w-5 h-[2px] rounded-full bg-teal-500" />
                  </span>
                )}
                <Icon
                  className={cn("w-[22px] h-[22px] transition-colors", active ? "text-teal-500" : "text-slate-400")}
                  strokeWidth={active ? 2.2 : 1.7}
                />
                <span className={cn("text-[10px] font-medium leading-none transition-colors", active ? "text-teal-500" : "text-slate-400")}>
                  {label}
                </span>
              </button>
            );
          })}

          {/* Centre spacer — keeps left/right tabs balanced around the FAB */}
          <div className="flex-1" />

          {/* Right tabs */}
          {RIGHT_TABS.map(({ id, Icon, label, path }) => {
            const active = pathname === path || pathname.startsWith(path + "/");
            return (
              <button
                key={id}
                className="flex-1 flex flex-col items-center justify-center gap-[3px] pb-1 select-none active:opacity-50 transition-opacity relative"
                onClick={() => navigate(path)}
              >
                {active && (
                  <span className="absolute top-0 inset-x-0 flex justify-center">
                    <span className="w-5 h-[2px] rounded-full bg-teal-500" />
                  </span>
                )}
                <Icon
                  className={cn("w-[22px] h-[22px] transition-colors", active ? "text-teal-500" : "text-slate-400")}
                  strokeWidth={active ? 2.2 : 1.7}
                />
                <span className={cn("text-[10px] font-medium leading-none transition-colors", active ? "text-teal-500" : "text-slate-400")}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Floating scan button — sits in the notch, protrudes above nav */}
        <button
          className="absolute select-none active:scale-95 transition-transform"
          style={{
            left: "50%",
            transform: "translateX(-50%)",
            top: `-14px`,          /* raise above nav top edge */
            width: 58,
            height: 58,
          }}
          onClick={() => setScannerOpen(true)}
          aria-label="Scan QR code"
        >
          <div
            className="w-full h-full rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)", boxShadow: "0 4px 16px rgba(20,184,166,0.50), 0 1px 3px rgba(0,0,0,0.15)" }}
          >
            <QrCode className="w-[26px] h-[26px] text-white" strokeWidth={2.25} />
          </div>
          <span className="block text-center text-[10px] font-bold text-teal-500 mt-0.5 leading-none">Scan</span>
        </button>
      </div>

      <QRScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onAppointmentFound={(id) => {
          setScannerOpen(false);
          navigate(`/staff-calendar?qrApt=${id}`);
        }}
      />
    </>
  );
}
