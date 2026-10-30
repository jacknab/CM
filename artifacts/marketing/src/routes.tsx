import { RouteObject } from 'react-router';
import HomePage from './pages/index';
import FeaturesPage from './pages/features';
import PricingPage from './pages/pricing';
import ProductsPage from './pages/products';
import ContactPage from './pages/contact';
import AboutPage from './pages/about';
import BlogPage from './pages/blog';
import BookingPage from './pages/booking';
import AutumnPage from './pages/autumn';
import VietnameseNailSalonSoftwarePage from './pages/vietnamese-nail-salon-software';
import PhanMemTiemNailPage from './pages/vi/phan-mem-tiem-nail';
import NailSalonTurnSystemPage from './pages/nail-salon-turn-system';
import ChiaTuaTiemNailPage from './pages/vi/chia-tua-tiem-nail';
import CareersPage from './pages/careers';
import ChangelogPage from './pages/changelog';
import RoadmapPage from './pages/roadmap';
import PrivacyPage from './pages/privacy';
import TermsPage from './pages/terms';
import CertxaVsGlossGeniusPage from './pages/compare/glossgenius';
import CertxaVsVagaroPage from './pages/compare/vagaro';
import CertxaVsFreshaPage from './pages/compare/fresha';
import CertxaVsSquarePage from './pages/compare/square';
import TradePublicationsPage from './pages/backlinks/trade-publications';
import RoundupOutreachPage from './pages/backlinks/roundup-outreach';
import ProductHuntLaunchPage from './pages/backlinks/product-hunt';
import Week1SubmissionsPage from './pages/backlinks/week1-submissions';
// Eager import so renderToString doesn't hit a Suspense boundary on 404 routes
// and abort to client rendering. The prod 404 page is tiny; the dev-tools
// variant stays lazy because it pulls in dev-only code we don't want in
// production bundles.
import CartPage from './pages/cart';
import OrderConfirmedPage from './pages/order-confirmed';
import ProdNotFoundPage from './pages/_404';

const NotFoundPage = ProdNotFoundPage;

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <HomePage />,
  },
  {
    path: '/features',
    element: <FeaturesPage />,
  },
  {
    path: '/vietnamese-nail-salon-software',
    element: <VietnameseNailSalonSoftwarePage />,
  },
  {
    path: '/vi/phan-mem-tiem-nail',
    element: <PhanMemTiemNailPage />,
  },
  {
    path: '/nail-salon-turn-system',
    element: <NailSalonTurnSystemPage />,
  },
  {
    path: '/vi/chia-tua-tiem-nail',
    element: <ChiaTuaTiemNailPage />,
  },
  {
    path: '/pricing',
    element: <PricingPage />,
  },
  {
    path: '/products',
    element: <ProductsPage />,
  },
  {
    path: '/contact',
    element: <ContactPage />,
  },
  {
    path: '/about',
    element: <AboutPage />,
  },
  {
    path: '/booking',
    element: <BookingPage />,
  },
  {
    path: '/autumn',
    element: <AutumnPage />,
  },
  {
    path: '/blog',
    element: <BlogPage />,
  },
  {
    path: '/careers',
    element: <CareersPage />,
  },
  {
    path: '/changelog',
    element: <ChangelogPage />,
  },
  {
    path: '/roadmap',
    element: <RoadmapPage />,
  },
  {
    path: '/privacy',
    element: <PrivacyPage />,
  },
  {
    path: '/terms',
    element: <TermsPage />,
  },
  {
    path: '/compare/certxa-vs-glossgenius',
    element: <CertxaVsGlossGeniusPage />,
  },
  {
    path: '/compare/certxa-vs-vagaro',
    element: <CertxaVsVagaroPage />,
  },
  {
    path: '/compare/certxa-vs-fresha',
    element: <CertxaVsFreshaPage />,
  },
  {
    path: '/compare/certxa-vs-square',
    element: <CertxaVsSquarePage />,
  },
  {
    path: '/backlinks/trade-publications',
    element: <TradePublicationsPage />,
  },
  {
    path: '/backlinks/roundup-outreach',
    element: <RoundupOutreachPage />,
  },
  {
    path: '/backlinks/product-hunt',
    element: <ProductHuntLaunchPage />,
  },
  {
    path: '/backlinks/week1-submissions',
    element: <Week1SubmissionsPage />,
  },
  {
    path: '/cart',
    element: <CartPage />,
  },
  {
    path: '/order-confirmed',
    element: <OrderConfirmedPage />,
  },
  {
    id: 'airo-not-found',
    path: '*',
    element: <NotFoundPage />,
  },
];

// Types for type-safe navigation
export type Path = '/' | '/features' | '/pricing' | '/products' | '/contact' | '/about' | '/blog' | '/careers' | '/changelog' | '/roadmap' | '/privacy' | '/terms' | '/compare/certxa-vs-glossgenius' | '/compare/certxa-vs-vagaro' | '/compare/certxa-vs-fresha' | '/compare/certxa-vs-square';

export type Params = Record<string, string | undefined>;
