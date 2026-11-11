import { useEffect, type ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import UnclaimedBanner from '@/components/UnclaimedBanner';
import HomePage from '@/pages/HomePage';
import ServicesPage from '@/pages/ServicesPage';
import GalleryPage from '@/pages/GalleryPage';
import AboutPage from '@/pages/AboutPage';
import ReviewsPage from '@/pages/ReviewsPage';
import VisitPage from '@/pages/VisitPage';
import { usePageRoute, type PageId } from '@/lib/router';
import { useSite } from '@/context/SiteContext';

const pages: Record<PageId, ComponentType> = {
  home: HomePage,
  services: ServicesPage,
  gallery: GalleryPage,
  about: AboutPage,
  reviews: ReviewsPage,
  visit: VisitPage,
};

function App() {
  const site = useSite();
  const route = usePageRoute();
  // A page the salon doesn't have (no photos, no reviews) opens the home page.
  const page: PageId = (route === 'gallery' && site.galleryPhotos.length === 0 && !site.loading) || (route === 'reviews' && site.reviews.length === 0 && !site.loading) ? 'home' : route;
  const PageComponent = pages[page];

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [page]);

  if (site.blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 px-6 text-center">
        <div>
          <h1 className="font-display text-4xl font-bold text-stone-900">Temporarily unavailable</h1>
          <p className="mt-3 text-stone-500">This website is not available right now. Please check back soon.</p>
        </div>
      </div>
    );
  }
  // A real salon's page waits for its own details: no sample salon in the meantime.
  if (!site.isSample && site.loading && !site.salonName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" role="status" aria-label="Loading">
        <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <UnclaimedBanner />
      <Header activePage={page} />
      <main key={page} className="animate-page-in">
        <PageComponent />
      </main>
      <Footer />
    </div>
  );
}

export default App;
