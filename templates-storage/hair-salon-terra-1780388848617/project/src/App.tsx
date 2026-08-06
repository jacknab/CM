import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const TERRA = '#C25B35';
const CLAY = '#D4856A';
const SAND = '#F5EBE0';
const CREAM = '#FAF5EE';
const SOIL = '#3D2214';
const WARM = '#E8D5C4';

const services = [
  { name: 'Earth Cut', price: '$88', desc: 'Grounded in texture' },
  { name: 'Clay Colour', price: '$165+', desc: 'Earthy, rich tones' },
  { name: 'Terracotta Balayage', price: '$220', desc: 'Warm dimension' },
  { name: 'Argan Oil Treatment', price: '$80', desc: 'Deep conditioning' },
  { name: 'Root Touch-Up', price: '$95', desc: 'Seamless regrowth' },
  { name: 'Curl & Wave', price: '$110', desc: 'Natural texture work' },
  { name: 'Men\'s Artisan Cut', price: '$72', desc: 'Refined & natural' },
  { name: 'Scalp Detox', price: '$75', desc: 'Clay-based cleanse' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
    <div style={{ background: CREAM, color: SOIL }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(250,245,238,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${WARM}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Spectral', serif", fontSize: 22, color: SOIL, letterSpacing: 2 }}>Terra</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: CLAY, fontSize: 12, letterSpacing: 2 }}
                className="uppercase hover:text-orange-800 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: TERRA, color: SAND, borderRadius: 4, letterSpacing: 2, fontSize: 12 }}
              className="uppercase px-7 py-2.5 hover:opacity-90 transition-opacity duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: SOIL }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: CLAY }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO — full bleed with warm image */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
          className="absolute inset-0 w-full h-full object-cover" alt="" style={{ filter: 'saturate(0.8) sepia(20%)' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(to right, rgba(61,34,20,0.75) 0%, rgba(61,34,20,0.3) 50%, transparent 100%)` }} />
        <div className="relative z-10 h-full flex items-center px-8 md:px-20">
          <div className="max-w-xl">
            <div className="flex items-center gap-4 mb-6">
              <div style={{ width: 32, height: 2, background: CLAY, borderRadius: 2 }} />
              <p style={{ color: CLAY, letterSpacing: 5, fontSize: 11 }} className="uppercase">Artisan Hair Studio</p>
            </div>
            <h1 style={{ fontFamily: "'Spectral', serif", fontSize: 'clamp(52px, 9vw, 110px)', color: SAND, lineHeight: 0.9 }} className="mb-8">
              Grounded<br /><em>in earth.</em>
            </h1>
            <p style={{ color: '#D4B8A8', lineHeight: 1.8, fontSize: 16, maxWidth: 420 }} className="mb-10">
              Hair care rooted in natural materials and honest craft. Rich earthy tones, textures that feel alive, appointments that nourish.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: TERRA, color: SAND }}
                className="px-8 py-3.5 text-sm font-medium hover:opacity-90 transition-opacity duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1.5px solid rgba(212,133,106,0.5)`, color: CLAY }}
                className="px-8 py-3.5 text-sm font-medium hover:bg-white/10 transition-colors duration-300">
                Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: SAND }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: TERRA, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Our Philosophy</p>
            <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 'clamp(28px, 4vw, 50px)', color: SOIL }} className="leading-tight mb-8">
              Hair should feel<br />like you, only<br /><em>more so.</em>
            </h2>
            <p style={{ color: '#7A5A48', lineHeight: 1.8, fontSize: 15 }} className="mb-5">
              Terra was built around the idea that the best hair work enhances who you already are. We don't impose trends — we listen, then create something that belongs to you entirely.
            </p>
            <p style={{ color: '#7A5A48', lineHeight: 1.8, fontSize: 15 }} className="mb-10">
              Every product we use is sourced from artisan makers who share our commitment to natural ingredients and ethical production.
            </p>
            <div className="grid grid-cols-3 gap-6">
              {[['8', 'Artisans'], ['5+', 'Years'], ['1,200+', 'Guests']].map(([n, l]) => (
                <div key={l} style={{ borderTop: `2px solid ${CLAY}`, paddingTop: 16 }}>
                  <p style={{ fontFamily: "'Spectral', serif", fontSize: 36, color: TERRA }}>{n}</p>
                  <p style={{ color: '#9A7060', fontSize: 12, letterSpacing: 1 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/5', borderRadius: 4, filter: 'saturate(0.9) sepia(10%)' }} alt="" />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: TERRA, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 44, color: SOIL }}>Services</h2>
            <div style={{ width: 40, height: 2, background: CLAY, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {services.map(({ name, price, desc }) => (
              <div key={name} style={{ background: SAND, border: `1px solid ${WARM}`, borderRadius: 8 }}
                className="p-6 hover:shadow-md hover:border-orange-300 transition-all duration-300 group">
                <h3 style={{ fontFamily: "'Spectral', serif", fontSize: 18, color: SOIL }} className="mb-2">{name}</h3>
                <p style={{ color: '#9A7060', fontSize: 12, lineHeight: 1.5 }} className="mb-4">{desc}</p>
                <p style={{ fontFamily: "'Spectral', serif", fontSize: 26, color: TERRA }}>{price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: TERRA, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Work</p>
          <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 44, color: SOIL }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: i % 3 === 0 ? '4/5' : '1/1', borderRadius: 4 }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.85) sepia(8%)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: SOIL }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: CLAY, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Visit</p>
          <h2 style={{ fontFamily: "'Spectral', serif", fontSize: 44, color: SAND }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['34 Brick Lane', 'London, E1 6RF'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7377 0194'] },
                { icon: <Mail size={16} />, lines: ['hello@terrahair.studio'] },
                { icon: <Clock size={16} />, lines: ['Tue–Sat: 9am – 7pm', 'Sun: 10am – 4pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: CLAY, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#A08070', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #5D3A28`, color: '#A08070' }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-orange-600 hover:text-orange-400 transition-colors duration-300">
                <Instagram size={16} />
              </a>
            </div>
            <div style={{ background: '#4A2A18', borderRadius: 8, border: `1px solid #5D3A28` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#3D2214', border: '1px solid #5D3A28', color: SAND, borderRadius: 4, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-amber-950 focus:border-orange-600 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you're interested in..."
                style={{ background: '#3D2214', border: '1px solid #5D3A28', color: SAND, borderRadius: 4, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 85 }}
                className="placeholder:text-amber-950 focus:border-orange-600 transition-colors duration-300" />
              <button style={{ background: TERRA, color: SAND, borderRadius: 4, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#2A1608', borderTop: `1px solid #3D2214` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Spectral', serif", color: CLAY, fontSize: 16 }}>Terra</span>
          <p style={{ color: '#5D3A28', fontSize: 12 }}>&copy; {new Date().getFullYear()} Terra Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
