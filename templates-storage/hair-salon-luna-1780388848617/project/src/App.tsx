import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const NAVY = '#0A0F1E';
const DEEP = '#0F1A30';
const GOLD = '#D4A853';
const GOLD_LIGHT = '#F0CC84';
const STAR = '#7A9BC8';
const CREAM = '#F5EFE0';

const services = [
  { name: 'Lunar Cut', price: '$105' },
  { name: 'Celestial Colour', price: '$195+' },
  { name: 'Midnight Balayage', price: '$250+' },
  { name: 'Starlight Toning', price: '$115' },
  { name: 'Eclipse Treatment', price: '$95' },
  { name: 'Full Moon Blowout', price: '$70' },
  { name: 'Nova Men\'s Cut', price: '$80' },
  { name: 'Constellation Highlights', price: '$175+' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
];

const Stars = () => (
  <div className="absolute inset-0 pointer-events-none overflow-hidden">
    {[...Array(60)].map((_, i) => (
      <div key={i} style={{
        position: 'absolute',
        left: `${(i * 37 + 13) % 100}%`,
        top: `${(i * 23 + 7) % 100}%`,
        width: i % 5 === 0 ? 3 : 1.5,
        height: i % 5 === 0 ? 3 : 1.5,
        borderRadius: '50%',
        background: i % 5 === 0 ? GOLD_LIGHT : 'rgba(255,255,255,0.6)',
        opacity: 0.4 + (i % 3) * 0.2,
      }} />
    ))}
  </div>
);

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
    <div style={{ background: NAVY, color: CREAM }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(10,15,30,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid #1A2540` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Cinzel', serif", fontSize: 18, letterSpacing: 6, color: CREAM }}>LUNA</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: STAR, fontSize: 11, letterSpacing: 4 }}
                className="uppercase hover:text-yellow-300 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid ${GOLD}`, color: GOLD_LIGHT, fontSize: 11, letterSpacing: 4 }}
              className="uppercase px-6 py-2.5 hover:bg-yellow-900/20 transition-colors duration-300">
              Reserve
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: STAR }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: DEEP, borderTop: `1px solid #1A2540` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: STAR }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <Stars />
        <div className="absolute inset-0">
          <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
            className="w-full h-full object-cover opacity-30" alt="" style={{ filter: 'hue-rotate(200deg) saturate(0.5)' }} />
          <div className="absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 50%, rgba(15,26,48,0.4) 0%, rgba(10,15,30,0.9) 100%)` }} />
        </div>
        {/* Moon circle */}
        <div className="absolute right-16 top-24 pointer-events-none" style={{ width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, rgba(212,168,83,0.15) 0%, rgba(212,168,83,0.05) 60%, transparent 100%)`, border: `1px solid rgba(212,168,83,0.2)` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <p style={{ color: STAR, letterSpacing: 10, fontSize: 10 }} className="uppercase mb-8">✦ Hair Atelier ✦</p>
          <h1 style={{ fontFamily: "'Cinzel', serif", fontSize: 'clamp(56px, 10vw, 130px)', color: CREAM, fontWeight: 300, letterSpacing: 20 }}
            className="mb-6">LUNA</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
            <div style={{ width: 60, height: 1, background: `linear-gradient(to right, transparent, ${GOLD})` }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GOLD }} />
            <div style={{ width: 60, height: 1, background: `linear-gradient(to left, transparent, ${GOLD})` }} />
          </div>
          <p style={{ color: '#8A9ABE', lineHeight: 1.9, fontSize: 15, maxWidth: 420 }} className="mb-12">
            Where celestial artistry meets earthly beauty. Transformations as luminous as moonlight.
          </p>
          <div className="flex gap-5">
            <button onClick={() => scrollTo('contact')}
              style={{ background: GOLD, color: NAVY, fontFamily: "'Cinzel', serif", letterSpacing: 4, fontSize: 11 }}
              className="uppercase px-8 py-3.5 hover:opacity-90 transition-opacity duration-300">
              Reserve
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1px solid rgba(212,168,83,0.3)`, color: STAR, letterSpacing: 4, fontSize: 11 }}
              className="uppercase px-8 py-3.5 hover:bg-white/5 transition-colors duration-300">
              Services
            </button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: DEEP }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'hue-rotate(200deg) saturate(0.6)' }} alt="" />
            <div style={{ position: 'absolute', top: -8, left: -8, right: 8, bottom: 8, border: `1px solid rgba(212,168,83,0.2)`, pointerEvents: 'none' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <span style={{ color: GOLD, fontSize: 18 }}>✦</span>
              <p style={{ color: GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase">Our Story</p>
            </div>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 'clamp(28px, 4vw, 48px)', color: CREAM, fontWeight: 300 }} className="leading-tight mb-8">
              Guided by the<br />Light of the Moon
            </h2>
            <p style={{ color: '#7A8BAF', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Luna Atelier was born from a fascination with cycles — the way light transforms what we see. Like the moon, our work reveals beauty that was always there, waiting to be unveiled.
            </p>
            <p style={{ color: '#7A8BAF', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Our six-chair atelier in the heart of the city draws clients who seek something more than a haircut — a ritual, a transformation, a moment of stillness.
            </p>
            <div className="flex gap-10">
              {[['✦ 6', 'Master Artists'], ['8+', 'Years'], ['★ 5.0', 'Google']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Cinzel', serif", fontSize: 28, color: GOLD_LIGHT }}>{n}</p>
                  <p style={{ color: STAR, fontSize: 10, letterSpacing: 3 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: NAVY }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: STAR, letterSpacing: 8, fontSize: 10 }} className="uppercase mb-4">✦ Menu ✦</p>
            <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 44, fontWeight: 300, color: CREAM }}>Services</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginTop: 16 }}>
              <div style={{ width: 40, height: 1, background: `linear-gradient(to right, transparent, ${GOLD})` }} />
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: GOLD }} />
              <div style={{ width: 40, height: 1, background: `linear-gradient(to left, transparent, ${GOLD})` }} />
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price }) => (
              <div key={name} style={{ border: `1px solid #1A2540`, borderRadius: 4 }}
                className="px-6 py-5 flex justify-between items-center hover:border-yellow-800 hover:bg-white/2 transition-all duration-300 group">
                <div className="flex items-center gap-3">
                  <span style={{ color: '#2A3550', fontSize: 14 }}>✦</span>
                  <span style={{ fontFamily: "'Cinzel', serif", fontSize: 14, color: CREAM, fontWeight: 300, letterSpacing: 2 }}
                    className="group-hover:text-yellow-200 transition-colors duration-300">{name}</span>
                </div>
                <span style={{ fontFamily: "'Cinzel', serif", fontSize: 20, color: GOLD, fontWeight: 300 }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#06091A' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: STAR, letterSpacing: 8, fontSize: 10 }} className="uppercase text-center mb-3">✦ Portfolio ✦</p>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 40, fontWeight: 300, color: CREAM }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'hue-rotate(180deg) saturate(0.5) brightness(0.9)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DEEP }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: STAR, letterSpacing: 8, fontSize: 10 }} className="uppercase text-center mb-4">✦ Visit ✦</p>
          <h2 style={{ fontFamily: "'Cinzel', serif", fontSize: 40, fontWeight: 300, color: CREAM }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              {[
                { icon: <MapPin size={15} />, lines: ['7 Chandos Place', 'London, WC2N 4HG'] },
                { icon: <Phone size={15} />, lines: ['+44 20 7836 0142'] },
                { icon: <Mail size={15} />, lines: ['reserve@lunaatelier.co.uk'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 10am – 8pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: GOLD, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: STAR, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #1A2540`, color: STAR }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-yellow-700 hover:text-yellow-400 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#0A0F1E', border: `1px solid #1A2540` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: 'transparent', borderBottom: '1px solid #1A2540', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 18, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-slate-800 focus:border-yellow-700 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service desired..."
                style={{ background: 'transparent', borderBottom: '1px solid #1A2540', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 24, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-slate-800 focus:border-yellow-700 transition-colors duration-300" />
              <button style={{ background: GOLD, color: NAVY, fontFamily: "'Cinzel', serif", letterSpacing: 4, fontSize: 11, width: '100%', padding: '14px 0' }}
                className="uppercase hover:opacity-90 transition-opacity duration-300">
                Reserve
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#060810', borderTop: `1px solid #1A2540` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Cinzel', serif", fontWeight: 300, letterSpacing: 6, color: '#3A4A6A', fontSize: 12 }}>LUNA</span>
          <p style={{ color: '#1A2540', fontSize: 12 }}>&copy; {new Date().getFullYear()} Luna Atelier</p>
        </div>
      </footer>
    </div>
  );
}
