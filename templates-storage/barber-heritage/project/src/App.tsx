import { Loader2 } from 'lucide-react';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Difference from '@/components/Difference';
import FounderStatement from '@/components/FounderStatement';
import Gallery from '@/components/Gallery';
import CallToAction from '@/components/CallToAction';
import Footer from '@/components/Footer';
import { useSite } from '@/context/SiteContext';

function App() {
  const site = useSite();

  if (site.blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0d0b] px-6 text-center text-white">
        <div>
          <h1 className="text-4xl font-bold">Temporarily unavailable</h1>
          <p className="mt-3 text-white/50">This website is not available right now. Please check back soon.</p>
        </div>
      </div>
    );
  }
  // A real shop's page waits for its own details: no sample shop in the meantime.
  if (!site.isSample && site.loading && !site.salonName) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f0d0b]" role="status" aria-label="Loading">
        <Loader2 className="h-7 w-7 animate-spin text-[#c9a96e]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0d0b] text-white">
      <Navbar />
      <main>
        <Hero />
        <Services />
        <Difference />
        <FounderStatement />
        <Gallery />
        <CallToAction />
      </main>
      <Footer />
    </div>
  );
}

export default App;
