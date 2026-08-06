import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const SILVER = '#C0C8D0';
const STEEL = '#7A8A98';
const DARK = '#080C10';
const DARK2 = '#0D1218';
const ACCENT = '#4A8AB8';

const services = [
  { name: 'PRECISION CUT', price: '$110', tag: 'Signature' },
  { name: 'CHROME COLOUR', price: '$200+', tag: 'Premium' },
  { name: 'SILVER TONING', price: '$130', tag: 'Specialty' },
  { name: 'BOND TREATMENT', price: '$100', tag: 'Restoration' },
  { name: 'BLOWOUT FINISH', price: '$70', tag: 'Style' },
  { name: 'SCALP RITUAL', price: '$85', tag: 'Wellness' },
  { name: 'MEN\'S DESIGN CUT', price: '$80', tag: 'Men\'s' },
  { name: 'OMBRE SYSTEM', price: '$245+', tag: 'Colour' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeService, setActiveService] = useState(0);

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
    <div style={{ background: DARK, color: SILVER }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(8,12,16,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(10px)' : 'none', borderBottom: scrolled ? `1px solid #1A2028` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: 10, color: SILVER, fontFamily: "'Exo 2', sans-serif" }}>OBSIDIAN</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#4A5A6A', fontSize: 11, letterSpacing: 4 }}
                className="uppercase hover:text-blue-400 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid #2A3A4A`, color: SILVER, fontSize: 11, letterSpacing: 4 }}
              className="uppercase px-6 py-2.5 hover:bg-blue-900/20 hover:border-blue-600 transition-all duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: STEEL }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: DARK2, borderTop: `1px solid #1A2028` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: '#4A5A6A' }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0">
          <img src="https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
            className="w-full h-full object-cover" alt="" style={{ filter: 'grayscale(40%) contrast(1.1)' }} />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(8,12,16,0.9) 0%, rgba(8,12,16,0.6) 100%)' }} />
          {/* Geometric accent lines */}
          <div className="absolute inset-0 pointer-events-none">
            <div style={{ position: 'absolute', top: '20%', left: '5%', width: 1, height: '40%', background: 'rgba(74,138,184,0.3)' }} />
            <div style={{ position: 'absolute', bottom: '15%', right: '5%', width: '30%', height: 1, background: 'rgba(74,138,184,0.3)' }} />
          </div>
        </div>
        <div className="relative z-10 h-screen flex items-center px-8 md:px-20">
          <div className="max-w-2xl">
            <p style={{ color: ACCENT, letterSpacing: 8, fontSize: 11, marginBottom: 20 }} className="uppercase">Premium Hair Studio</p>
            <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 'clamp(56px, 10vw, 130px)', fontWeight: 200, lineHeight: 0.85, letterSpacing: -4, color: SILVER }}
              className="mb-8">
              OB<br />SI<br />DI<br />AN
            </h1>
            <p style={{ color: STEEL, lineHeight: 1.7, fontSize: 15, marginBottom: 36 }}>
              Precision hair artistry in volcanic black. Technical excellence, editorial vision, zero compromise.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: ACCENT, color: 'white', letterSpacing: 3, fontSize: 11 }}
                className="uppercase px-8 py-3.5 hover:bg-blue-500 transition-colors duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1px solid #2A3A4A`, color: STEEL, letterSpacing: 3, fontSize: 11 }}
                className="uppercase px-8 py-3.5 hover:border-blue-600 hover:text-blue-400 transition-all duration-300">
                Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: DARK2 }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: ACCENT, letterSpacing: 6, fontSize: 11 }} className="uppercase mb-5">Our Identity</p>
            <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 200, letterSpacing: -2, color: SILVER }} className="mb-8 leading-tight">
              Forged in<br />obsidian.
            </h2>
            <div style={{ width: 40, height: 1, background: ACCENT }} className="mb-8" />
            <p style={{ color: STEEL, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Obsidian was built on the belief that the finest hair work is invisible — you see the result, not the technique. Eight senior stylists, each with over a decade of precision training.
            </p>
            <p style={{ color: STEEL, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              We specialise in chrome tones, steel silvers, and dimensional dark colour — but our foundation is technical mastery across all styles.
            </p>
            <div className="flex gap-10">
              {[['8', 'Master Stylists'], ['10+', 'Years Est.'], ['★ 4.9', 'Rating']].map(([n, l]) => (
                <div key={l} style={{ borderTop: `1px solid #1A2028`, paddingTop: 16 }}>
                  <p style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 32, fontWeight: 200, color: ACCENT }}>{n}</p>
                  <p style={{ color: '#4A5A6A', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src="https://images.pexels.com/photos/3992672/pexels-photo-3992672.jpeg?auto=compress&cs=tinysrgb&w=900&q=85"
              className="w-full object-cover" style={{ aspectRatio: '3/4', filter: 'grayscale(20%)' }} alt="" />
            <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 2, background: `linear-gradient(to bottom, transparent, ${ACCENT}, transparent)` }} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end gap-8 mb-14">
            <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 48, fontWeight: 200, letterSpacing: -2, color: SILVER }}>SERVICES</h2>
            <div style={{ flex: 1, height: 1, background: '#1A2028' }} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {services.map(({ name, price, tag }, i) => (
              <div key={name} onClick={() => setActiveService(i)}
                style={{ border: `1px solid ${activeService === i ? ACCENT : '#1A2028'}`, background: activeService === i ? 'rgba(74,138,184,0.06)' : 'transparent', cursor: 'pointer' }}
                className="p-5 flex justify-between items-center transition-all duration-300 group hover:border-blue-600">
                <div>
                  <p style={{ fontSize: 14, letterSpacing: 3, color: SILVER }} className="font-medium">{name}</p>
                  <p style={{ color: '#3A4A5A', fontSize: 11, letterSpacing: 1, marginTop: 3 }} className="uppercase">{tag}</p>
                </div>
                <span style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 22, fontWeight: 300, color: ACCENT }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#060A0E' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 48, fontWeight: 200, letterSpacing: -2, color: SILVER }} className="mb-12">WORK</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105"
                  style={{ filter: 'grayscale(25%) contrast(1.05)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK2 }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16">
          <div>
            <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontSize: 48, fontWeight: 200, letterSpacing: -2, color: SILVER }} className="mb-10">BOOK</h2>
            <div className="space-y-7">
              {[
                { icon: <MapPin size={15} />, lines: ['16 Shoreditch High Street', 'London, E1 6JE'] },
                { icon: <Phone size={15} />, lines: ['+44 20 7739 0154'] },
                { icon: <Mail size={15} />, lines: ['book@obsidian.studio'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 10am – 8pm', 'Sun: 11am – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ACCENT }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: STEEL, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #1A2028`, color: '#4A5A6A' }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-blue-600 hover:text-blue-400 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
          </div>
          <div>
            {['NAME', 'EMAIL', 'PHONE', 'SERVICE'].map(p => (
              <input key={p} placeholder={p}
                style={{ background: 'transparent', borderBottom: '1px solid #1A2028', color: SILVER, display: 'block', width: '100%', padding: '14px 0', marginBottom: 20, outline: 'none', fontSize: 12, letterSpacing: 4 }}
                className="placeholder:text-slate-800 focus:border-blue-600 transition-colors duration-300" />
            ))}
            <button style={{ background: ACCENT, color: 'white', letterSpacing: 6, fontSize: 11, width: '100%', padding: '15px 0' }}
              className="uppercase hover:bg-blue-500 transition-colors duration-300">
              Request Booking
            </button>
          </div>
        </div>
      </section>

      <footer style={{ background: '#040608', borderTop: `1px solid #1A2028` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 600, letterSpacing: 8, color: '#2A3A4A', fontSize: 11 }}>OBSIDIAN</span>
          <p style={{ color: '#1A2028', fontSize: 12 }}>&copy; {new Date().getFullYear()} Obsidian Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
