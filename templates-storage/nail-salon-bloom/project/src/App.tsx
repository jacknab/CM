import { useEffect } from 'react';
import { SiteProvider, useSite } from '@/context/SiteContext';
import { BookingProvider } from '@/context/BookingContext';
import Header from '@/components/Header';
import Hero from '@/components/Hero';
import FeaturedServices from '@/components/FeaturedServices';
import Gallery from '@/components/Gallery';
import VisitUs from '@/components/VisitUs';
import Footer from '@/components/Footer';
import MobileBookingBar from '@/components/MobileBookingBar';
import BookingPanel from '@/components/BookingPanel';
import UnclaimedBanner from '@/components/UnclaimedBanner';

function SalonWebsite() {
  const { isUnclaimedAutoCreated, isCertxaPreparedSite, canBookOnline, services } = useSite();
  return <><Header /><UnclaimedBanner /><main><Hero />{(!isCertxaPreparedSite || services.length > 0) && <FeaturedServices />}{!isUnclaimedAutoCreated && <Gallery />}<VisitUs /></main><Footer />{canBookOnline && <MobileBookingBar />}{canBookOnline && <BookingPanel />}</>;
}

/**
 * Sets the document <title> to:
 *   {Business Name} | Nail Salon in {City, ST} - Certxa
 * Runs inside SiteProvider so it has access to live tenant data.
 */
function TitleManager() {
  const { salonName, city, loading } = useSite();

  useEffect(() => {
    if (loading) return;
    // city may be "Denver, CO, 80218" — take only City + State (first two parts)
    const cityState = city
      .split(',')
      .slice(0, 2)
      .map((s) => s.trim())
      .filter(Boolean)
      .join(', ');

    const title = cityState
      ? `${salonName} | Nail Salon in ${cityState} - Certxa`
      : `${salonName} | Nail Salon - Certxa`;

    document.title = title;
    // Also keep the og:title meta in sync for any social previews rendered client-side
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
  }, [salonName, city, loading]);

  return null;
}

export default function App() {
  return (
    <BookingProvider>
      <SiteProvider>
        <TitleManager />
        <SalonWebsite />
      </SiteProvider>
    </BookingProvider>
  );
}
