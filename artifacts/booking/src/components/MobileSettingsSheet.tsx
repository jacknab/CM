import { Sun, Moon, Settings, Building2, MessageSquare, Mail, LogOut, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTheme } from "@/hooks/use-theme";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "react-router-dom";

interface MobileSettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SETTING_LINKS = [
  { icon: Building2,    label: "Business Settings",   to: "/business-settings" },
  { icon: MessageSquare,label: "SMS Notifications",   to: "/sms-settings" },
  { icon: Mail,         label: "Email Notifications", to: "/mail-settings" },
  { icon: Settings,     label: "Calendar Settings",   to: "/calendar-settings" },
];

export function MobileSettingsSheet({ open, onOpenChange }: MobileSettingsSheetProps) {
  const { theme, setTheme } = useTheme();
  const { user, logoutAsync } = useAuth();
  const navigate = useNavigate();
  const isDark = theme === "dark";

  const handleLogout = async () => {
    try { await logoutAsync(); } catch {}
    onOpenChange(false);
    navigate("/auth");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-[20px] px-0 pb-0 max-h-[88vh] overflow-y-auto"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <SheetHeader className="px-5 pt-2 pb-4">
          <SheetTitle className="text-left text-base font-semibold">Settings</SheetTitle>
        </SheetHeader>

        {/* User profile row */}
        <div className="mx-4 mb-4 flex items-center gap-3 rounded-2xl bg-muted/60 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
            {user?.firstName?.[0] ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">
              {user?.firstName} {user?.lastName}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>

        {/* ── Appearance ──────────────────────────────────────── */}
        <div className="px-4 mb-2">
          <p className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Appearance
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                {isDark
                  ? <Moon className="h-4 w-4 text-primary" />
                  : <Sun className="h-4 w-4 text-primary" />
                }
                <div>
                  <p className="text-sm font-medium">{isDark ? "Dark Mode" : "Light Mode"}</p>
                  <p className="text-xs text-muted-foreground">
                    {isDark ? "Easy on the eyes at night" : "Clean, bright interface"}
                  </p>
                </div>
              </div>

              {/* Toggle switch */}
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                role="switch"
                aria-checked={isDark}
                className={cn(
                  "relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                  "transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isDark ? "bg-primary" : "bg-muted"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-lg",
                    "transform transition-transform duration-200 ease-in-out",
                    "flex items-center justify-center",
                    isDark ? "translate-x-5" : "translate-x-0"
                  )}
                >
                  {isDark
                    ? <Moon className="h-3 w-3 text-primary" />
                    : <Sun className="h-3 w-3 text-amber-500" />
                  }
                </span>
              </button>
            </div>

            {/* Light / Dark quick pills */}
            <div className="border-t border-border px-4 py-3 flex gap-2">
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
                  !isDark
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
              >
                <Sun className="h-3.5 w-3.5" />
                Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all",
                  isDark
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted"
                )}
              >
                <Moon className="h-3.5 w-3.5" />
                Dark
              </button>
            </div>
          </div>
        </div>

        {/* ── Settings links ───────────────────────────────────── */}
        <div className="px-4 mb-2">
          <p className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Settings
          </p>
          <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
            {SETTING_LINKS.map(({ icon: Icon, label, to }) => (
              <Link
                key={to}
                to={to}
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-foreground/70" />
                </div>
                <span className="flex-1 text-sm font-medium">{label}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        {/* ── Logout ───────────────────────────────────────────── */}
        <div className="px-4 pb-6 pt-2">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-3.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>

        {/* Safe-area spacer */}
        <div style={{ height: "env(safe-area-inset-bottom, 0px)" }} />
      </SheetContent>
    </Sheet>
  );
}
