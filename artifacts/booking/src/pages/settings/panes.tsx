// The page shown for each settings section. Used by the Settings shell (pages/SettingsShell.tsx) and by the
// Certxa apps' own Settings page (pages/app/AppSettings.tsx), so no setting has two pages.
import type React from "react";
// Section components mounted in the detail pane. Each still renders its own
// <AppLayout>; inside the shell that collapses to a bare padded wrapper
// (see AppLayout + settings-shell-context).
import BusinessSettings from "@/pages/BusinessSettings";
import BusinessHoursPage from "@/pages/BusinessHoursPage";
import LanguageSettings from "@/pages/LanguageSettings";
import CalendarSettings from "@/pages/CalendarSettings";
import OnlineBooking from "@/pages/OnlineBooking";
import KioskSettings from "@/pages/KioskSettings";
import Registers from "@/pages/Registers";
import CashDrawers from "@/pages/CashDrawers";
import PayrollSettings from "@/pages/PayrollSettings";
import ClientNotifications from "@/pages/settings/ClientNotifications";
import DataTransferPage from "@/pages/DataTransferPage";
import FeaturesSettings from "@/pages/FeaturesSettings";
import PersonalDetailsPage from "@/pages/settings/PersonalDetailsPage";
import MyPreferencesPage from "@/pages/settings/MyPreferencesPage";
import SecurityPage from "@/pages/settings/SecurityPage";
import WorkPlacesSettings from "@/pages/settings/WorkPlacesSettings";

// slug → pane component. Every inline settings destination lives here; the nav
// (settings-nav.ts) decides which appear in the rail and under which tab.
export const SETTINGS_PANES: Record<string, React.ComponentType> = {
  "personal-details": PersonalDetailsPage,
  "my-preferences": MyPreferencesPage,
  "security": SecurityPage,
  "business": BusinessSettings,
  "hours": BusinessHoursPage,
  "online-booking": OnlineBooking,
  "booking-controls": CalendarSettings,
  "kiosk": KioskSettings,
  "registers": Registers,
  "cash-drawers": CashDrawers,
  "client-notifications": ClientNotifications,
  "language": LanguageSettings,
  "advanced": FeaturesSettings,
  "data-transfer": DataTransferPage,
  "commission": PayrollSettings,
  "work-places": WorkPlacesSettings,
};

