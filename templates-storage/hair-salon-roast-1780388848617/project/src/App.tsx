import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, Coffee } from 'lucide-react';

const ESPRESSO = '#2C1810';
const ROAST = '#6B3A28';
const CARAMEL = '#C8905A';
const LATTE = '#E8C8A8';
const CREAM = '#FBF5EE';
const WARM = '#F0E8DC';

const services = [
  { name: 'The Roast Cut', price: '$90', desc: 'Warm, rich, grounded' },
  { name: 'Caramel Balayage', price: '$215+', desc: 'Warm dimension & flow' },
  { name: 'Espresso Colour', price: '$175+', desc: 'Deep, rich brown tones' },
  { name: 'Mocha Highlights', price: '$165+', desc: 'Layered warmth' },
  { name: 'Latte Gloss', price: '$88', desc: 'Shine & tone refresh' },
  { name: 'Bond Repair', price: '$98', desc: 'Deep restoration' },
  { name: 'Men\'s Craft Cut', price: '$74', desc: 'Natural, clean finish' },
  { name: 'Scalp Treatment', price: '$80', desc: 'Nourishing ritual' },
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
    <div style={{ background: CREAM, color: ESPRESSO }} className="overflow-x-hidden">

      <nav style={{ background: scrolled ? 'rgba(251,245,238,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${WARM}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Coffee size={20} style={{ color: CARAMEL }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Merriweather', serif", fontSize: 18, color: ESPRESSO, letterSpacing: 1 }}>The Roast</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} style={{ color: CARAMEL, fontSize: 13, fontWeight: 400 }}
                className="capitalize hover:text-amber-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} style={{ background: ROAST, color: CREAM, borderRadius: 50 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300">Book Now</button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: ESPRESSO }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: CARAMEL }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - split, warm editorial */}
      <section id="hero" className="min-h-screen grid md:grid-cols-2">
        <div className="relative overflow-hidden" style={{ minHeight: 500 }}>
          <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1200&q=85"
            className="w-full h-full object-cover" style={{ minHeight: 500, filter: 'saturate(0.75) sepia(20%)' }} alt="" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(44,24,16,0.5) 0%, rgba(107,58,40,0.2) 100%)' }} />
        </div>
        <div style={{ background: WARM }} className="flex flex-col justify-center px-12 md:px-16 py-24 md:py-0">
          <div className="flex items-center gap-3 mb-6">
            <Coffee size={16} style={{ color: CARAMEL }} strokeWidth={1.5} />
            <p style={{ color: CARAMEL, letterSpacing: 4, fontSize: 11 }} className="uppercase">Hair & Colour Studio</p>
          </div>
          <h1 style={{ fontFamily: "'Merriweather', serif", fontSize: 'clamp(38px, 5vw, 64px)', color: ESPRESSO, lineHeight: 1.05, fontStyle: 'italic' }} className="mb-6">
            Warm like your<br />first coffee.
          </h1>
          <p style={{ color: ROAST, lineHeight: 1.9, fontSize: 15, maxWidth: 380 }} className="mb-10">
            The Roast is a warm, intimate hair studio obsessed with brown, caramel, and amber tones — the kind that look rich, lived-in, and completely natural.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')} style={{ background: ROAST, color: CREAM, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:opacity-90 transition-opacity duration-300 shadow-sm">Book Appointment</button>
            <button onClick={() => scrollTo('services')} style={{ border: `1.5px solid ${LATTE}`, color: ROAST, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:border-amber-400 transition-colors duration-300">Services</button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: CARAMEL, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-5">Our Story</p>
            <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 'clamp(28px, 4vw, 48px)', color: ESPRESSO, fontStyle: 'italic' }} className="leading-tight mb-8">
              Colour that feels<br />like coming home
            </h2>
            <p style={{ color: ROAST, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              The Roast was born from a love of warm, cosy spaces and the colour palette that fills them — espresso, chocolate, caramel, latte. Our studio brings that same warmth to every appointment.
            </p>
            <p style={{ color: ROAST, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Seven stylists, each trained in warm tone mastery, offering a deeply personal experience where you leave looking like the best version of yourself.
            </p>
            <div className="flex gap-10">
              {[['7', 'Stylists'], ['8+', 'Years'], ['1,900+', 'Clients']].map(([n, l]) => (
                <div key={l} style={{ borderTop: `2px solid ${LATTE}`, paddingTop: 16 }}>
                  <p style={{ fontFamily: "'Merriweather', serif", fontSize: 36, color: CARAMEL, fontStyle: 'italic' }}>{n}</p>
                  <p style={{ color: '#9A7A5A', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <img src="https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
            className="w-full object-cover rounded-2xl shadow-lg" style={{ aspectRatio: '4/3', filter: 'saturate(0.8) sepia(15%)' }} alt="" />
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: CARAMEL, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: ESPRESSO, fontStyle: 'italic' }}>Services</h2>
            <div style={{ width: 40, height: 2, background: LATTE, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {services.map(({ name, price, desc }) => (
              <div key={name} style={{ background: CREAM, borderRadius: 16, border: `1px solid ${LATTE}` }}
                className="p-6 flex justify-between items-center hover:shadow-md hover:border-amber-300 transition-all duration-300 group">
                <div>
                  <h3 style={{ fontFamily: "'Merriweather', serif", fontSize: 16, color: ESPRESSO, fontStyle: 'italic' }} className="mb-1">{name}</h3>
                  <p style={{ color: '#A08060', fontSize: 12 }}>{desc}</p>
                </div>
                <span style={{ fontFamily: "'Merriweather', serif", fontSize: 22, color: CARAMEL, fontStyle: 'italic' }} className="ml-4 flex-shrink-0">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: CARAMEL, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: ESPRESSO, fontStyle: 'italic' }} className="text-center mb-12">Our Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.8) sepia(12%)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: ESPRESSO }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3 justify-center mb-3">
            <Coffee size={18} style={{ color: CARAMEL }} strokeWidth={1.5} />
            <p style={{ color: CARAMEL, letterSpacing: 4, fontSize: 11 }} className="uppercase">Come visit</p>
          </div>
          <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: CREAM, fontStyle: 'italic' }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['67 Newington Road', 'Sydney, NSW 2042'] },
                { icon: <Phone size={16} />, lines: ['(02) 9555 0192'] },
                { icon: <Mail size={16} />, lines: ['hello@theroast.studio'] },
                { icon: <Clock size={16} />, lines: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 4pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: CARAMEL, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#A08060', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #4A2818`, color: '#8A6040' }}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:border-amber-700 hover:text-amber-500 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#3A2214', borderRadius: 20, border: `1px solid #4A3224` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2C1810', border: '1px solid #4A3224', color: CREAM, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-amber-950 focus:border-amber-600 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you'd like..."
                style={{ background: '#2C1810', border: '1px solid #4A3224', color: CREAM, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-amber-950 focus:border-amber-600 transition-colors duration-300" />
              <button style={{ background: CARAMEL, color: ESPRESSO, borderRadius: 10, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">Book Appointment</button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A0E08', borderTop: `1px solid #2C1810` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Coffee size={14} style={{ color: '#5A3A28' }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Merriweather', serif", color: '#5A3A28', fontSize: 14 }}>The Roast</span>
          </div>
          <p style={{ color: '#3A2214', fontSize: 12 }}>&copy; {new Date().getFullYear()} The Roast Studio</p>
        </div>
      </footer>
    </div>
  );
}
