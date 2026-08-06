import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X, Waves } from 'lucide-react';

const TEAL = '#1A8A8A';
const AQUA = '#2ABABA';
const LIGHT = '#C8EAEA';
const SKY = '#EBF8F8';
const WHITE = '#FDFFFE';
const DARK = '#0A2828';

const services = [
  { name: 'Marea Cut', price: '€85', desc: 'The signature cut' },
  { name: 'Ocean Colour', price: '€170+', desc: 'Deep, dimensional tones' },
  { name: 'Aqua Balayage', price: '€215+', desc: 'Sun-rippled highlights' },
  { name: 'Sea Glass Treatment', price: '€85', desc: 'Marine mineral ritual' },
  { name: 'Coastal Highlights', price: '€155+', desc: 'Sun-kissed strands' },
  { name: 'Scalp Revival', price: '€75', desc: 'Seaweed scalp mask' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3998429/pexels-photo-3998429.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
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
    <div style={{ background: WHITE, color: DARK }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(253,255,254,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(26,138,138,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Waves size={22} style={{ color: TEAL }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: DARK, fontStyle: 'italic' }}>Marea</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#4A9A9A', fontSize: 14, fontWeight: 500 }}
                className="capitalize hover:text-teal-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: TEAL, color: 'white', borderRadius: 50 }}
              className="px-7 py-2.5 text-sm font-medium hover:bg-teal-700 transition-colors duration-300 shadow-sm">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: WHITE, borderTop: `1px solid ${LIGHT}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: '#4A9A9A' }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${DARK} 0%, #0D4444 40%, ${TEAL} 75%, ${AQUA} 100%)` }} />
        {/* Wave lines */}
        <svg className="absolute bottom-0 left-0 right-0" viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ height: 200 }}>
          <path d="M0,100 C360,40 720,160 1080,80 C1260,40 1380,120 1440,100 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.05)" />
          <path d="M0,140 C400,80 800,180 1200,100 C1320,70 1400,150 1440,130 L1440,200 L0,200 Z" fill="rgba(255,255,255,0.03)" />
        </svg>
        <div className="absolute inset-0 opacity-15" style={{ backgroundImage: "url('https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=50')", backgroundSize: 'cover', backgroundPosition: 'center', mixBlendMode: 'screen' }} />
        <div className="relative z-10 h-full flex items-center justify-center text-center px-6">
          <div>
            <Waves size={36} style={{ color: LIGHT, margin: '0 auto 20px' }} strokeWidth={1} />
            <p style={{ color: LIGHT, letterSpacing: 6, fontSize: 11 }} className="uppercase mb-5">Ibiza · Barcelona · Lisboa</p>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(56px, 10vw, 120px)', color: 'white', lineHeight: 0.9, fontStyle: 'italic' }}
              className="mb-8">
              Marea
            </h1>
            <p style={{ color: 'rgba(200,234,234,0.85)', lineHeight: 1.9, fontSize: 16, maxWidth: 440, margin: '0 auto 36px' }}>
              Mediterranean hair rituals. Sea-inspired colour, natural movement, and the unhurried luxury of a coastal afternoon.
            </p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => scrollTo('contact')}
                style={{ background: 'white', color: TEAL }}
                className="px-8 py-3.5 rounded-full text-sm font-medium hover:bg-teal-50 transition-colors duration-300 shadow-lg">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1.5px solid rgba(200,234,234,0.5)`, color: 'white' }}
                className="px-8 py-3.5 rounded-full text-sm hover:bg-white/10 transition-colors duration-300">
                Our Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: SKY }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
            className="rounded-3xl w-full object-cover shadow-xl" style={{ aspectRatio: '4/3', filter: 'saturate(0.9) hue-rotate(-20deg)' }} alt="" />
          <div>
            <p style={{ color: TEAL, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Our Story</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(28px, 4vw, 48px)', color: DARK, fontStyle: 'italic' }} className="leading-tight mb-6">
              Inspired by the<br />Mediterranean tide
            </h2>
            <p style={{ color: '#3A7A7A', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Marea (the tide, in Spanish) was born from summers spent on the costa — watching the way salt air and sunlight transform hair into something natural and alive. That effortless quality is what we recreate in our studio.
            </p>
            <p style={{ color: '#3A7A7A', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Our stylists are trained in Barcelona and Lisbon, bringing a warm, relaxed professionalism that makes every visit feel like a mini-holiday.
            </p>
            <div className="flex gap-10">
              {[['7', 'Stylists'], ['6+', 'Years'], ['★4.9', 'Rating']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 38, color: TEAL, fontStyle: 'italic' }}>{n}</p>
                  <p style={{ color: '#5AAAAA', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: WHITE }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: TEAL, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }}>Services</h2>
            <div style={{ width: 40, height: 2, background: AQUA, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {services.map(({ name, price, desc }) => (
              <div key={name} style={{ border: `1px solid ${LIGHT}`, borderRadius: 16, background: SKY }}
                className="p-6 flex justify-between items-center hover:border-teal-300 hover:shadow-sm transition-all duration-300 group">
                <div>
                  <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: DARK, fontStyle: 'italic' }} className="mb-1">{name}</h3>
                  <p style={{ color: '#5AAAAA', fontSize: 13 }}>{desc}</p>
                </div>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: TEAL, fontStyle: 'italic' }} className="ml-4 flex-shrink-0">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: SKY }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: TEAL, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group shadow-sm hover:shadow-lg transition-shadow duration-300" style={{ aspectRatio: '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.9) hue-rotate(-10deg)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <Waves size={28} style={{ color: AQUA, margin: '0 auto 16px' }} strokeWidth={1.5} className="block mx-auto" />
          <p style={{ color: AQUA, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Reservations</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, color: 'white', fontStyle: 'italic' }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['Carrer del Consell de Cent 240', 'Barcelona, 08011'] },
                { icon: <Phone size={16} />, lines: ['+34 93 555 0178'] },
                { icon: <Mail size={16} />, lines: ['hola@mareasalon.es'] },
                { icon: <Clock size={16} />, lines: ['Mar–Sáb: 10h – 20h', 'Dom: 11h – 17h'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: AQUA, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#5AAAAA', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3">
                {[<Instagram size={15} />, <Facebook size={15} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #1A4A4A`, color: '#4A8A8A' }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:border-teal-400 hover:text-teal-300 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#0D3838', borderRadius: 16, border: `1px solid #1A4A4A` }} className="p-8">
              {['Nombre / Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#0A2828', border: '1px solid #1A4A4A', color: 'white', borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-teal-950 focus:border-teal-400 transition-colors duration-300" />
              ))}
              <textarea placeholder="Servicio deseado / Service desired"
                style={{ background: '#0A2828', border: '1px solid #1A4A4A', color: 'white', borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-teal-950 focus:border-teal-400 transition-colors duration-300" />
              <button style={{ background: TEAL, color: 'white', borderRadius: 10, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:bg-teal-600 transition-colors duration-300">
                Reserve Now
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#061818', borderTop: `1px solid #0A2828` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Waves size={16} style={{ color: '#2A6060' }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Playfair Display', serif", color: '#2A6060', fontSize: 16, fontStyle: 'italic' }}>Marea</span>
          </div>
          <p style={{ color: '#0A3030', fontSize: 12 }}>&copy; {new Date().getFullYear()} Marea Salon</p>
        </div>
      </footer>
    </div>
  );
}
