import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const NAVY = '#1A2040';
const MIDNIGHT = '#141830';
const ROSE_GOLD = '#C8907A';
const BLUSH = '#EBC4B4';
const CREAM = '#FAF4F0';
const DIM = '#6A7A9A';

const services = [
  { name: 'Dusk Cut', price: '$108' },
  { name: 'Rose Gold Colour', price: '$195+' },
  { name: 'Twilight Balayage', price: '$255+' },
  { name: 'Dusk Toning', price: '$125' },
  { name: 'Sunset Highlights', price: '$185+' },
  { name: 'Evening Treatment', price: '$98' },
  { name: 'Men\'s Dusk Cut', price: '$82' },
  { name: 'Bond Restoration', price: '$110' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);

  const heroImages = [
    'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
    'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  ];

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
    <div style={{ background: MIDNIGHT, color: CREAM }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(20,24,48,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid #2A3060` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 16, color: CREAM, letterSpacing: 4, fontWeight: 400 }}>DUSK</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: DIM, fontSize: 12, letterSpacing: 3 }}
                className="uppercase hover:text-rose-300 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid ${ROSE_GOLD}`, color: BLUSH, letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-6 py-2.5 hover:bg-rose-900/20 transition-colors duration-300">
              Reserve
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DIM }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: MIDNIGHT, borderTop: `1px solid #2A3060` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: DIM }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-3000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '3000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})`, filter: 'hue-rotate(200deg) saturate(0.6)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(26,32,64,0.9) 0%, rgba(20,24,48,0.7) 100%)` }} />
          </div>
        ))}
        {/* Rose gold gradient accent */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(to right, transparent, ${ROSE_GOLD}, transparent)` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <p style={{ color: ROSE_GOLD, letterSpacing: 10, fontSize: 10 }} className="uppercase mb-8">✦ Atelier ✦</p>
          <h1 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 'clamp(44px, 8vw, 100px)', color: CREAM, lineHeight: 0.9, fontWeight: 400 }}
            className="mb-6">DUSK</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div style={{ width: 60, height: 1, background: `linear-gradient(to right, transparent, ${ROSE_GOLD})` }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: ROSE_GOLD }} />
            <div style={{ width: 60, height: 1, background: `linear-gradient(to left, transparent, ${ROSE_GOLD})` }} />
          </div>
          <p style={{ color: BLUSH, lineHeight: 1.9, fontSize: 16, maxWidth: 420, opacity: 0.8 }} className="mb-12">
            The in-between hour. When light turns rose, colour deepens, and hair becomes art. Welcome to the hour of transformation.
          </p>
          <div className="flex gap-5">
            <button onClick={() => scrollTo('contact')}
              style={{ background: ROSE_GOLD, color: MIDNIGHT, letterSpacing: 4, fontSize: 11 }}
              className="uppercase px-8 py-3.5 hover:opacity-90 transition-opacity duration-300">
              Reserve
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1px solid rgba(200,144,122,0.3)`, color: BLUSH, letterSpacing: 4, fontSize: 11 }}
              className="uppercase px-8 py-3.5 hover:bg-white/5 transition-colors duration-300">
              Services
            </button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: NAVY }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: ROSE_GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase mb-5">The Atelier</p>
            <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 'clamp(24px, 4vw, 44px)', color: CREAM, fontWeight: 400 }} className="mb-8 leading-tight">
              Where colour<br />meets twilight
            </h2>
            <div style={{ width: 40, height: 1, background: ROSE_GOLD }} className="mb-8" />
            <p style={{ color: DIM, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Dusk is an atelier built around the twilight palette — the extraordinary hour when warm rose gold meets cool navy sky. We translate this magic into hair colour that belongs to no one else.
            </p>
            <p style={{ color: DIM, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Six colourists, all trained in advanced toning and balayage, each bringing a signature interpretation of the dusk palette to your appointment.
            </p>
            <div className="flex gap-10">
              {[['6', 'Colourists'], ['7+', 'Years'], ['★5.0', 'Rating']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 32, color: ROSE_GOLD, fontWeight: 400 }}>{n}</p>
                  <p style={{ color: '#4A5A7A', fontSize: 10, letterSpacing: 3 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src="https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'hue-rotate(180deg) saturate(0.7)' }} alt="" />
            <div style={{ position: 'absolute', top: -8, right: -8, bottom: 8, left: 8, border: `1px solid rgba(200,144,122,0.2)`, pointerEvents: 'none' }} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: MIDNIGHT }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: ROSE_GOLD, letterSpacing: 8, fontSize: 10 }} className="uppercase mb-4">✦ Menu ✦</p>
            <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 40, color: CREAM, fontWeight: 400 }}>Services</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price }) => (
              <div key={name} style={{ border: `1px solid #2A3060` }}
                className="px-6 py-5 flex justify-between items-center hover:border-rose-800 hover:bg-white/2 transition-all duration-300 group">
                <span style={{ letterSpacing: 2, fontSize: 14, color: CREAM }}
                  className="group-hover:text-rose-200 transition-colors duration-300">{name}</span>
                <span style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 18, color: ROSE_GOLD, fontWeight: 400 }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#0E1228' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: ROSE_GOLD, letterSpacing: 8, fontSize: 10 }} className="uppercase text-center mb-4">✦ Portfolio ✦</p>
          <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 40, color: CREAM, fontWeight: 400 }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'hue-rotate(180deg) saturate(0.6)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: NAVY }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: ROSE_GOLD, letterSpacing: 8, fontSize: 10 }} className="uppercase text-center mb-4">✦ Reservations ✦</p>
          <h2 style={{ fontFamily: "'Cinzel Decorative', serif", fontSize: 40, color: CREAM, fontWeight: 400 }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={15} />, lines: ['14 Pont Street', 'London, SW1X 9EL'] },
                { icon: <Phone size={15} />, lines: ['+44 20 7235 0198'] },
                { icon: <Mail size={15} />, lines: ['reserve@dusk.studio'] },
                { icon: <Clock size={15} />, lines: ['Wed–Sat: 10am – 8pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ROSE_GOLD }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: DIM, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #2A3060`, color: DIM }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-rose-500 hover:text-rose-400 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div>
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: 'transparent', borderBottom: '1px solid #2A3060', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 18, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-slate-800 focus:border-rose-500 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service desired..."
                style={{ background: 'transparent', borderBottom: '1px solid #2A3060', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 24, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-slate-800 focus:border-rose-500 transition-colors duration-300" />
              <button style={{ background: ROSE_GOLD, color: MIDNIGHT, letterSpacing: 4, fontSize: 11, width: '100%', padding: '14px 0' }}
                className="uppercase hover:opacity-90 transition-opacity duration-300">
                Reserve
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0A0E20', borderTop: `1px solid #1A2040` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Cinzel Decorative', serif", color: '#2A3050', fontSize: 12, letterSpacing: 4 }}>DUSK</span>
          <p style={{ color: '#1A2040', fontSize: 12 }}>&copy; {new Date().getFullYear()} Dusk Atelier</p>
        </div>
      </footer>
    </div>
  );
}
