import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const TAN = '#C4A882';
const LINEN = '#F2EBE0';
const WARM = '#E8DDD0';
const CREAM = '#FAF7F3';
const DARK = '#2A2018';
const STONE = '#8A7A68';

const services = [
  { name: 'The Linen Cut', price: '$88' },
  { name: 'Natural Colour', price: '$165+' },
  { name: 'Warm Balayage', price: '$210+' },
  { name: 'Nourishing Treatment', price: '$82' },
  { name: 'Root Blend', price: '$92' },
  { name: 'Blowout & Style', price: '$62' },
  { name: 'Men\'s Tailored Cut', price: '$72' },
  { name: 'Scalp Revival', price: '$78' },
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
    <div style={{ background: CREAM, color: DARK }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(250,247,243,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${WARM}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, color: DARK, letterSpacing: 3 }}>Linen & Co.</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: STONE, fontSize: 13 }}
                className="capitalize hover:text-stone-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: DARK, color: CREAM, borderRadius: 2 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300">
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
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: STONE }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - minimal, text-forward */}
      <section id="hero" className="min-h-screen grid md:grid-cols-2">
        <div className="flex flex-col justify-center px-12 md:px-20 py-32 md:py-0">
          <div style={{ width: 32, height: 2, background: TAN, marginBottom: 28 }} />
          <p style={{ color: STONE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Hair & Colour Studio</p>
          <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 'clamp(44px, 7vw, 88px)', color: DARK, lineHeight: 0.95 }} className="mb-8">
            Refined.<br /><em>Natural.</em><br />Yours.
          </h1>
          <p style={{ color: STONE, lineHeight: 1.9, fontSize: 15, maxWidth: 380 }} className="mb-10">
            Linen & Co. is a quietly elevated hair studio for those who appreciate considered beauty — clean lines, natural tones, and a completely unhurried experience.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')}
              style={{ background: DARK, color: CREAM }}
              className="px-8 py-3.5 text-sm hover:opacity-90 transition-opacity duration-300">
              Book Now
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1.5px solid ${WARM}`, color: STONE }}
              className="px-8 py-3.5 text-sm hover:border-stone-400 transition-colors duration-300">
              Services
            </button>
          </div>
        </div>
        <div className="relative overflow-hidden" style={{ minHeight: 500 }}>
          <img src="https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1200&q=85"
            className="w-full h-full object-cover" style={{ minHeight: 500, filter: 'saturate(0.75)' }} alt="" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(250,247,243,0.1) 0%, transparent 100%)' }} />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: LINEN }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              { n: 'Understated', desc: 'No pressure, no fuss. Just beautiful hair.' },
              { n: 'Considered', desc: 'Every detail of your experience is curated.' },
              { n: 'Enduring', desc: 'Cuts and colours designed to last.' },
            ].map(({ n, desc }) => (
              <div key={n} style={{ borderTop: `2px solid ${TAN}`, paddingTop: 24 }}>
                <h3 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 22, color: DARK, fontStyle: 'italic' }} className="mb-3">{n}</h3>
                <p style={{ color: STONE, fontSize: 14, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p style={{ color: TAN, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Our Philosophy</p>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 'clamp(28px, 4vw, 46px)', color: DARK }} className="leading-tight mb-8">
                The quiet art of<br /><em>looking effortless</em>
              </h2>
              <p style={{ color: STONE, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
                True luxury is never loud. Linen & Co. was designed as an antidote to the chaotic, trend-driven world of mainstream hairdressing. We do less, with more care, and the results speak for themselves.
              </p>
            </div>
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover" style={{ aspectRatio: '4/3', filter: 'saturate(0.7)' }} alt="" />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end justify-between mb-14">
            <div>
              <p style={{ color: TAN, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: DARK }}>Services</h2>
            </div>
            <div style={{ width: 60, height: 1, background: WARM }} className="mb-3" />
          </div>
          {services.map(({ name, price }, i) => (
            <div key={name} className="group flex items-center justify-between py-5 cursor-default hover:bg-stone-50 transition-colors duration-300 px-3 -mx-3"
              style={{ borderBottom: '1px solid #E8DFCF' }}>
              <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 18, color: DARK }}
                className="font-normal italic group-hover:text-stone-700 transition-colors duration-300">{name}</span>
              <span style={{ fontSize: 20, color: TAN, fontFamily: "'Libre Baskerville', serif" }}>{price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: TAN, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Work</p>
          <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: DARK }} className="text-center mb-12">Portfolio</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.75)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: TAN, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Visit</p>
          <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: CREAM }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['38 Motcomb Street', 'London, SW1X 8JU'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7245 0166'] },
                { icon: <Mail size={16} />, lines: ['hello@linenco.studio'] },
                { icon: <Clock size={16} />, lines: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 4pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: TAN, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: STONE, fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #3A2A18`, color: STONE }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-amber-700 hover:text-amber-500 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#3A2818' }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: 'transparent', borderBottom: '1px solid #4A3828', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 18, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-stone-800 focus:border-amber-700 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service desired..."
                style={{ background: 'transparent', borderBottom: '1px solid #4A3828', color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 24, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-stone-800 focus:border-amber-700 transition-colors duration-300" />
              <button style={{ background: TAN, color: DARK, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A1008', borderTop: `1px solid #2A2018` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Libre Baskerville', serif", color: '#5A4A38', fontSize: 15 }}>Linen & Co.</span>
          <p style={{ color: '#3A2818', fontSize: 12 }}>&copy; {new Date().getFullYear()} Linen & Co. Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
