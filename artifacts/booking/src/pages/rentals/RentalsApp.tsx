import { Navigate, Routes, Route } from "react-router-dom";
import { Wrench, BarChart3, type LucideIcon } from "lucide-react";
import RentalsSidebar from "@/components/rentals/RentalsSidebar";
import RentalsMobileNav from "@/components/rentals/RentalsMobileNav";
import RentalsComingSoon from "@/components/rentals/RentalsComingSoon";
import TodayPage from "./TodayPage";
import SettingsPage from "./SettingsPage";
import SpacesPage from "./SpacesPage";
import AddSpacePage from "./AddSpacePage";
import SpaceDetailPage from "./SpaceDetailPage";
import ProfessionalsPage from "./ProfessionalsPage";
import AddProfessionalPage from "./AddProfessionalPage";
import ProfessionalDetailPage from "./ProfessionalDetailPage";
import LeasesPage from "./LeasesPage";
import AddLeasePage from "./AddLeasePage";
import LeaseDetailPage from "./LeaseDetailPage";
import RentPage from "./RentPage";
import RentChargeDetailPage from "./RentChargeDetailPage";

// Certxa Rentals' own application shell — mirrors the pattern already used by
// /isTeam and /isadmin (TeamApp.tsx: a self-contained shell + nested Routes,
// not mounted under the global StoreProvider/AppLayout/MobileBottomNav that
// wraps the rest of the authenticated Salon app). Access control is handled
// by the caller (App.tsx wraps this route in <RequirePermission
// permission={PERMISSIONS.RENTALS_VIEW}>), reusing the SAME session/role
// system as the rest of the app — unlike isTeam, Rentals is not a separate
// internal tool with its own login.
export default function RentalsApp() {
  return (
    <div className="fixed inset-0 flex bg-neutral-50" style={{ fontFamily: "'Inter', sans-serif" }}>
      <RentalsSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-hidden pb-14 md:pb-0">
          <Routes>
            <Route path="today" element={<TodayPage />} />
            <Route path="spaces" element={<SpacesPage />} />
            <Route path="spaces/new" element={<AddSpacePage />} />
            <Route path="spaces/:id" element={<SpaceDetailPage />} />
            <Route path="professionals" element={<ProfessionalsPage />} />
            <Route path="professionals/new" element={<AddProfessionalPage />} />
            <Route path="professionals/:id" element={<ProfessionalDetailPage />} />
            <Route path="leases" element={<LeasesPage />} />
            <Route path="leases/new" element={<AddLeasePage />} />
            <Route path="leases/:id" element={<LeaseDetailPage />} />
            <Route path="rent" element={<RentPage />} />
            <Route path="rent/:id" element={<RentChargeDetailPage />} />
            <Route
              path="maintenance"
              element={
                <ComingSoonRoute
                  title="Maintenance"
                  icon={Wrench}
                  description="Maintenance requests from your professionals will be tracked here in a future phase."
                />
              }
            />
            <Route
              path="reports"
              element={
                <ComingSoonRoute
                  title="Reports"
                  icon={BarChart3}
                  description="Occupancy and rent-roll reporting are coming in a future phase."
                />
              }
            />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/rentals/today" replace />} />
          </Routes>
        </main>
      </div>
      <RentalsMobileNav />
    </div>
  );
}

function ComingSoonRoute({
  title,
  icon,
  description,
}: {
  title: string;
  icon: LucideIcon;
  description: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 flex-shrink-0 items-center border-b border-neutral-200 bg-white px-5 md:px-6">
        <h1 className="font-[Outfit] text-[15px] font-semibold text-neutral-900">{title}</h1>
      </header>
      <RentalsComingSoon icon={icon} title={`${title} is on the way`} description={description} />
    </div>
  );
}
