import { Navigate, useLocation } from "react-router-dom";
import { useFeatureFlags } from "@/hooks/use-features";

/** Pages that belong to the booking system (owner, 2026-11-02). */
const BOOKING_PAGES = /^\/(calendar|appointments|booking\/new|staff-calendar|settings\/(online-booking|booking-controls)|manage\/ai-receptionist)(\/|$)/;

/**
 * With the booking system switched off (Settings › Advanced Features › Booking System) a page that belongs to it sends
 * the salon to its dashboard instead. Rendered once around the signed-in pages.
 */
export function BookingSystemGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const features = useFeatureFlags();
  if (!features.bookingSystem && BOOKING_PAGES.test(pathname)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
