import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SiteContext } from './context/SiteContext';
import { BookingPanelProvider } from './context/BookingPanelContext';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Intro from './components/Intro';
import Services from './components/Services';
import SalonStatusBar from './components/SalonStatusBar';
import Gallery from './components/Gallery';
import Reviews from './components/Reviews';
import Footer from './components/Footer';
import BookingPanel from './components/BookingPanel';
import { useSiteData } from './hooks/useSiteData';

// Shared QueryClient for all TanStack Query hooks in the template and booking flow.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: 60_000,
    },
  },
});

function AppInner() {
  const { data, blocked } = useSiteData();

  if (blocked) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center px-6">
        <div className="max-w-lg text-center space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Under Maintenance</h1>
          <p className="text-zinc-300 text-base">
            This website is temporarily unavailable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SiteContext.Provider value={data}>
      <BookingPanelProvider>
        <div className="font-sans bg-cream-100">
          <Navbar />
          <Hero />
          <Intro />
          <SalonStatusBar />
          <Services />
          <Gallery />
          <Reviews />
          <Footer />
        </div>
        <BookingPanel />
      </BookingPanelProvider>
    </SiteContext.Provider>
  );
}

function App() {
  useEffect(() => {
    // Strip legacy ?token= from URL
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has("token")) {
      urlParams.delete("token");
      const newSearch = urlParams.toString();
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + (newSearch ? `?${newSearch}` : "")
      );
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
