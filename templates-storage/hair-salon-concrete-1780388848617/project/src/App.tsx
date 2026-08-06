import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const CONCRETE = '#3A3A3A';
const CEMENT = '#6A6A6A';
const NEON = '#00FF88';
const DARK = '#1A1A1A';
const LIGHT = '#F0F0EE';
const ASH = '#AAAAAA';

const services = [
  { code: 'C01', name: 'ARCHITECT CUT', price: '$100', sub: 'Structure & precision' },
  { code: 'C02', name: 'CHROME COLOUR', price: '$185+', sub: 'Metallic dimension' },
  { code: 'C03', name: 'URBAN BALAYAGE', price: '$225+', sub: 'City-worn gradients' },
  { code: 'C04', name: 'BOND REBUILD', price: '$105', sub: 'Structural repair' },
  { code: 'C05', name: 'FINISH & DRY', price: '$68', sub: 'Polished completion' },
  { code: 'C06', name: 'SCALP SLAB', price: '$82', sub: 'Deep cleanse ritual' },
  { code: 'C07', name: 'SHARP MEN\'S CUT', price: '$78', sub: 'Razor clean lines' },
  { code: 'C08', name: 'GREY BLEND', price: '$95', sub: 'Natural integration' },
];

const heroImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
];

export default function App() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: DARK, color: LIGHT }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: DARK, borderBottom: `1px solid #2A2A2A` }}
        className="fixed top-0 left-0 right-0 z-50 py-4 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-3">
            <div style={{ width: 8, height: 8, background: NEON }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, letterSpacing: 6, fontWeight: 600 }}>CONCRETE</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: CEMENT, fontSize: 12, letterSpacing: 4, fontFamily: "'Barlow Condensed', sans-serif" }}
                className="uppercase hover:text-white transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: NEON, color: DARK, fontSize: 12, letterSpacing: 4, fontFamily: "'Barlow Condensed', sans-serif" }}
              className="uppercase px-7 py-2.5 font-semibold hover:opacity-90 transition-opacity duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: ASH }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ borderTop: `1px solid #2A2A2A` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: CEMENT }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-1500"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '1500ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})`, filter: 'grayscale(60%) contrast(1.2)' }} />
            <div className="absolute inset-0 bg-black/70" />
          </div>
        ))}
        {/* Geometric neon accents */}
        <div className="absolute bottom-0 left-0 right-0 z-10 h-1" style={{ background: NEON }} />
        <div className="absolute top-24 right-10 z-10 pointer-events-none" style={{ width: 80, height: 80, border: `1px solid rgba(0,255,136,0.3)` }} />
        <div className="relative z-10 h-full flex items-center px-8 md:px-20">
          <div>
            <p style={{ color: NEON, letterSpacing: 8, fontSize: 11, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 16 }} className="uppercase">Hair Studio · Chicago</p>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(64px, 13vw, 160px)', fontWeight: 700, lineHeight: 0.85, letterSpacing: -4 }}
              className="mb-8">
              CON<span style={{ color: NEON }}>CRETE</span>
            </h1>
            <p style={{ color: ASH, fontSize: 16, lineHeight: 1.6, maxWidth: 480, marginBottom: 32 }}>
              Raw precision. Industrial craft. Hair that's built to last and made to be noticed.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: NEON, color: DARK, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 4, fontSize: 13, fontWeight: 600 }}
                className="uppercase px-8 py-3.5 hover:opacity-90 transition-opacity duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1px solid #2A2A2A`, color: CEMENT, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 4, fontSize: 13 }}
                className="uppercase px-8 py-3.5 hover:border-white hover:text-white transition-colors duration-300">
                Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: '#222' }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <img src="https://images.pexels.com/photos/3992672/pexels-photo-3992672.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'grayscale(40%)' }} alt="" />
            <div style={{ position: 'absolute', bottom: -4, left: -4, width: 100, height: 4, background: NEON }} />
          </div>
          <div>
            <div style={{ width: 40, height: 4, background: NEON, marginBottom: 24 }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 700, lineHeight: 0.9, letterSpacing: -2 }} className="mb-8">
              BUILT ON<br />PRECISION.
            </h2>
            <p style={{ color: CEMENT, lineHeight: 1.8, fontSize: 15 }} className="mb-5">
              Concrete was built for people who demand more from their hair. No fluff, no fads — just exceptional craft from eight stylists who have each spent over a decade mastering their tools.
            </p>
            <p style={{ color: CEMENT, lineHeight: 1.8, fontSize: 15 }} className="mb-10">
              Our studio is industrial by design. Poured concrete floors, steel fixtures, natural light. The environment mirrors our philosophy: honest, durable, uncompromising.
            </p>
            <div className="grid grid-cols-3 gap-6">
              {[['8', 'Stylists'], ['10+', 'Years'], ['★4.9', 'Reviews']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 42, fontWeight: 700, color: NEON }}>{n}</p>
                  <p style={{ color: CEMENT, fontSize: 11, letterSpacing: 3 }} className="uppercase">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-8 mb-14">
            <div style={{ width: 8, height: 8, background: NEON }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: -2 }}>SERVICES</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-px bg-gray-800">
            {services.map(({ code, name, price, sub }) => (
              <div key={code} style={{ background: DARK }}
                className="p-6 flex justify-between items-start hover:bg-gray-900 transition-colors duration-300 group">
                <div>
                  <p style={{ color: NEON, fontSize: 11, letterSpacing: 3, fontFamily: "'Barlow Condensed', sans-serif", marginBottom: 4 }}>{code}</p>
                  <p style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 20, fontWeight: 600, letterSpacing: 1 }}
                    className="group-hover:text-green-400 transition-colors duration-300">{name}</p>
                  <p style={{ color: CEMENT, fontSize: 12, marginTop: 3 }}>{sub}</p>
                </div>
                <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 26, fontWeight: 700, color: ASH }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#111' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: -2 }} className="mb-12">WORK</h2>
          <div className="grid grid-cols-3 gap-px bg-gray-800">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '1/1', background: '#111' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
                  style={{ filter: 'grayscale(50%) contrast(1.1)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: '#222' }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16">
          <div>
            <div style={{ width: 40, height: 4, background: NEON, marginBottom: 24 }} />
            <h2 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 52, fontWeight: 700, letterSpacing: -2 }} className="mb-10">BOOK NOW</h2>
            <div className="space-y-6">
              {[
                { icon: <MapPin size={15} />, lines: ['1420 N Milwaukee Ave', 'Chicago, IL 60622'] },
                { icon: <Phone size={15} />, lines: ['(312) 555-0188'] },
                { icon: <Mail size={15} />, lines: ['book@concrete.studio'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 10am – 9pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: NEON }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: CEMENT, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #2A2A2A`, color: CEMENT }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-green-500 hover:text-green-400 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
          </div>
          <div>
            {['NAME', 'EMAIL', 'PHONE', 'SERVICE'].map(p => (
              <input key={p} placeholder={p}
                style={{ background: '#1A1A1A', border: 'none', borderBottom: '1px solid #2A2A2A', color: LIGHT, display: 'block', width: '100%', padding: '14px 0', marginBottom: 20, outline: 'none', fontSize: 12, letterSpacing: 4, fontFamily: "'Barlow Condensed', sans-serif" }}
                className="placeholder:text-gray-700 focus:border-green-500 transition-colors duration-300" />
            ))}
            <button style={{ background: NEON, color: DARK, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: 6, fontSize: 13, fontWeight: 700, width: '100%', padding: '15px 0' }}
              className="uppercase hover:opacity-90 transition-opacity duration-300">
              Submit
            </button>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E0E0E', borderTop: `1px solid #2A2A2A` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div style={{ width: 6, height: 6, background: NEON }} />
            <span style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, letterSpacing: 6, color: '#3A3A3A', fontSize: 12 }}>CONCRETE</span>
          </div>
          <p style={{ color: '#2A2A2A', fontSize: 12 }}>&copy; {new Date().getFullYear()} Concrete Studio</p>
        </div>
      </footer>
    </div>
  );
}
