import { SiteProvider } from '@/context/SiteContext';
import Navbar from '@/components/Navbar';
import Hero from '@/components/Hero';
import Services from '@/components/Services';
import Team from '@/components/Team';
import Gallery from '@/components/Gallery';
import Contact from '@/components/Contact';
import Footer from '@/components/Footer';

export default function App() {
  return (
    <SiteProvider>
      <Navbar />
      <main>
        <Hero />
        <Services />
        <Team />
        <Gallery />
        <Contact />
      </main>
      <Footer />
    </SiteProvider>
  );
}
