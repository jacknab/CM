import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const COPPER = '#B8602A';
const BRONZE = '#D4884A';
const RUST = '#8A3A1A';
const CREAM = '#F8F0E8';
const WARM = '#EDE4D8';
const DARK = '#2A1A0E';

const services = [
  { name: 'The Forge Cut', price: '$95', tag: 'Signature' },
  { name: 'Copper Balayage', price: '$230+', tag: 'Specialty' },
  { name: 'Rust & Auburn Colour', price: '$185+', tag: 'Colour' },
  { name: 'Bond Restoration', price: '$105', tag: 'Treatment' },
  { name: 'Blowout & Finish', price: '$68', tag: 'Style' },
  { name: 'Men\'s Craft Cut', price: '$78', tag: 'Men\'s' },
  { name: 'Scalp Treatment', price: '$82', tag: 'Wellness' },
  { name: 'Highlights & Dimension', price: '$175+', tag: 'Colour' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);

  const heroImages = [
    'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
    'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  ];

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: CREAM, color: DARK }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(248,240,232,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${WARM}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Oswald', sans-serif", fontSize: 22, color: DARK, letterSpacing: 8, fontWeight: 400 }}>FORGE</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#9A6A4A', fontSize: 12, letterSpacing: 3 }}
                className="uppercase hover:text-orange-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: COPPER, color: CREAM, letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-7 py-2.5 hover:opacity-90 transition-opacity duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: '#9A6A4A' }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-2000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '2000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})`, filter: 'saturate(0.8) sepia(20%)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to right, rgba(42,26,14,0.85) 0%, rgba(42,26,14,0.4) 60%, transparent 100%)` }} />
          </div>
        ))}
        {/* Copper accent bar */}
        <div className="absolute left-0 top-0 bottom-0 z-10" style={{ width: 4, background: `linear-gradient(to bottom, transparent, ${COPPER}, transparent)` }} />
        <div className="relative z-10 h-full flex items-center px-12 md:px-24">
          <div>
            <p style={{ color: BRONZE, letterSpacing: 8, fontSize: 11, fontFamily: "'Oswald', sans-serif", marginBottom: 16 }} className="uppercase">Artisan Hair Studio</p>
            <h1 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 'clamp(52px, 9vw, 110px)', color: CREAM, lineHeight: 0.9, fontStyle: 'italic' }} className="mb-8">
              Crafted<br />by hand.
            </h1>
            <div style={{ width: 60, height: 2, background: COPPER, marginBottom: 24 }} />
            <p style={{ color: '#C8A888', lineHeight: 1.8, fontSize: 16, maxWidth: 440 }} className="mb-10">
              Forge is a workshop for the discerning client. Honest, skilled, unhurried craftsmanship — every strand considered, every cut purposeful.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: COPPER, color: CREAM, letterSpacing: 3, fontSize: 12, fontFamily: "'Oswald', sans-serif" }}
                className="uppercase px-8 py-3.5 hover:opacity-90 transition-opacity duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1.5px solid rgba(184,96,42,0.4)`, color: BRONZE, letterSpacing: 3, fontSize: 12, fontFamily: "'Oswald', sans-serif" }}
                className="uppercase px-8 py-3.5 hover:border-orange-600 transition-colors duration-300">
                Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: COPPER, letterSpacing: 5, fontSize: 11, fontFamily: "'Oswald', sans-serif" }} className="uppercase mb-5">The Workshop</p>
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 'clamp(30px, 5vw, 56px)', color: DARK, fontStyle: 'italic' }} className="leading-tight mb-8">
              Hair made with<br />the hands of a<br />craftsperson
            </h2>
            <p style={{ color: '#7A5A3A', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Forge was built on the belief that great hair is a craft, not a service. Each of our seven artisan stylists approaches every appointment as a master would approach their workshop — with complete attention and genuine pride.
            </p>
            <p style={{ color: '#7A5A3A', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              We specialise in warm copper and bronze tones, but our expertise spans the full spectrum. What sets us apart is the time we take to get it exactly right.
            </p>
            <div className="grid grid-cols-3 gap-6">
              {[['7', 'Artisans'], ['9+', 'Years'], ['1,400+', 'Clients']].map(([n, l]) => (
                <div key={l} style={{ borderTop: `3px solid ${COPPER}`, paddingTop: 16 }}>
                  <p style={{ fontFamily: "'Source Serif 4', serif", fontSize: 38, color: COPPER, fontStyle: 'italic' }}>{n}</p>
                  <p style={{ color: '#9A7A5A', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'saturate(0.85) sepia(15%)' }} alt="" />
            <div style={{ position: 'absolute', bottom: -4, right: -4, width: '40%', height: 4, background: COPPER }} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-6 mb-14">
            <div style={{ width: 4, height: 40, background: COPPER }} />
            <div>
              <p style={{ color: COPPER, letterSpacing: 5, fontSize: 11, fontFamily: "'Oswald', sans-serif" }} className="uppercase mb-1">Menu</p>
              <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }}>Services</h2>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-px bg-gray-200">
            {services.map(({ name, price, tag }) => (
              <div key={name} style={{ background: CREAM }}
                className="p-6 flex justify-between items-center group hover:bg-orange-50 transition-colors duration-300">
                <div>
                  <p style={{ fontFamily: "'Oswald', sans-serif", fontSize: 16, letterSpacing: 2, color: DARK }}
                    className="group-hover:text-orange-800 transition-colors duration-300">{name}</p>
                  <p style={{ color: '#BBA08A', fontSize: 11, letterSpacing: 2, marginTop: 3 }} className="uppercase">{tag}</p>
                </div>
                <span style={{ fontFamily: "'Source Serif 4', serif", fontSize: 24, color: COPPER, fontStyle: 'italic' }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: COPPER, letterSpacing: 5, fontSize: 11, fontFamily: "'Oswald', sans-serif" }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }} className="text-center mb-12">The Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.85) sepia(10%)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-6 mb-14">
            <div style={{ width: 4, height: 40, background: COPPER }} />
            <h2 style={{ fontFamily: "'Source Serif 4', serif", fontSize: 44, color: CREAM, fontStyle: 'italic' }}>Contact</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['7 Leather Lane', 'London, EC1N 7SL'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7831 0162'] },
                { icon: <Mail size={16} />, lines: ['craft@forge.studio'] },
                { icon: <Clock size={16} />, lines: ['Tue–Sat: 9am – 7pm', 'Sun: 10am – 4pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: BRONZE, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#9A7A5A', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #3A2A1A`, color: '#9A7A5A' }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-orange-700 hover:text-orange-500 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#3A2214', border: `1px solid #4A2A14` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2A1A0E', border: '1px solid #3A2214', color: CREAM, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-amber-950 focus:border-orange-700 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service desired..."
                style={{ background: '#2A1A0E', border: '1px solid #3A2214', color: CREAM, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-amber-950 focus:border-orange-700 transition-colors duration-300" />
              <button style={{ background: COPPER, color: CREAM, fontFamily: "'Oswald', sans-serif", letterSpacing: 4, fontSize: 12, width: '100%', padding: '14px 0' }}
                className="uppercase hover:opacity-90 transition-opacity duration-300">
                Book Now
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A0E06', borderTop: `1px solid #2A1A0E` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Oswald', sans-serif", color: '#5A3A2A', fontSize: 14, letterSpacing: 6 }}>FORGE</span>
          <p style={{ color: '#3A2214', fontSize: 12 }}>&copy; {new Date().getFullYear()} Forge Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
