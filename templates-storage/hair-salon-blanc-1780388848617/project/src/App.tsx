import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, ArrowUpRight } from 'lucide-react';

const services = [
  { n: 'The Cut', p: '€98', t: '60 min' },
  { n: 'Full Colour', p: '€185+', t: '120 min' },
  { n: 'Balayage', p: '€235+', t: '150 min' },
  { n: 'Toning', p: '€88', t: '45 min' },
  { n: 'Blowout', p: '€65', t: '45 min' },
  { n: 'Bond Repair', p: '€95', t: '60 min' },
  { n: 'Men\'s Cut', p: '€78', t: '45 min' },
  { n: 'Extensions', p: 'POA', t: 'Consultation' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-white text-gray-900 overflow-x-hidden" style={{ fontFamily: "'Jost', sans-serif" }}>
      <style>{`
        @keyframes slideUp { from { opacity:0; transform:translateY(30px); } to { opacity:1; transform:translateY(0); } }
        .su { animation: slideUp 1s ease both; }
      `}</style>

      {/* NAV */}
      <nav style={{ borderBottom: scrolled ? '1px solid #F0EDE8' : '1px solid transparent', background: 'white' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-300 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, letterSpacing: 8, fontStyle: 'italic' }}>Blanc</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                className="text-xs uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] border-b border-black pb-0.5 hover:gap-3 transition-all duration-300">
              Book <ArrowUpRight size={12} />
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} className="text-gray-800">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block text-xs uppercase tracking-[0.2em] text-gray-400">{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="h-screen flex items-center justify-center relative overflow-hidden">
        {/* Subtle background texture */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 20% 80%, #F8F4EF 0%, white 60%)' }} />
        <div className="relative z-10 text-center px-6">
          <p className="su text-xs uppercase tracking-[0.4em] text-gray-300 mb-10" style={{ animationDelay: '0.1s' }}>
            Paris · London · Zurich
          </p>
          <h1 className="su" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(80px, 16vw, 200px)', fontWeight: 300, lineHeight: 0.8, letterSpacing: -6, fontStyle: 'italic', color: '#0A0A0A', animationDelay: '0.2s' }}>
            Blanc
          </h1>
          <div className="su mx-auto my-10" style={{ width: 1, height: 80, background: '#D0C8BC', animationDelay: '0.35s' }} />
          <p className="su text-gray-400 text-sm leading-relaxed max-w-xs mx-auto mb-14 font-light" style={{ animationDelay: '0.4s', letterSpacing: 1 }}>
            Purity of craft. Clarity of vision. Hair that speaks without words.
          </p>
          <div className="su flex justify-center gap-10" style={{ animationDelay: '0.5s' }}>
            <button onClick={() => scrollTo('services')} className="text-xs uppercase tracking-[0.2em] text-gray-400 hover:text-black transition-colors duration-300 border-b border-gray-200 pb-0.5 hover:border-black">
              Services
            </button>
            <button onClick={() => scrollTo('contact')} className="flex items-center gap-1.5 text-xs uppercase tracking-[0.2em] border-b border-black pb-0.5 hover:gap-3 transition-all duration-300">
              Book <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {/* FULL WIDTH IMAGE BREAK */}
      <div style={{ height: '55vh', overflow: 'hidden' }}>
        <img src="https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
          className="w-full h-full object-cover" style={{ filter: 'saturate(0.6) contrast(1.05)' }} alt="" />
      </div>

      {/* ABOUT */}
      <section id="about" className="py-32 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-12 gap-12 items-start">
            <div className="md:col-span-4">
              <p className="text-xs uppercase tracking-[0.25em] text-gray-300 mb-4">About</p>
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 12, fontStyle: 'italic', color: '#B0A898', letterSpacing: 2, lineHeight: 2 }} className="uppercase">
                Est. 2014<br />Paris<br />7 Stylists
              </p>
            </div>
            <div className="md:col-span-8">
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(36px, 5vw, 64px)', fontWeight: 300, fontStyle: 'italic', lineHeight: 1 }} className="mb-8 text-gray-900">
                Blanc is an exercise<br />in restraint.
              </h2>
              <p className="text-gray-400 text-[15px] leading-relaxed mb-5 font-light">
                We believe in taking things away until only the essential remains. Our appointments are long and unhurried. Our spaces are calm. Our results are the only thing that speaks.
              </p>
              <p className="text-gray-400 text-[15px] leading-relaxed font-light">
                Seven senior stylists. No junior staff. Every client receives the undivided attention of someone who has spent years becoming exceptional at their craft.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: '#FAF8F5' }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end justify-between mb-16">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gray-300 mb-3">Menu</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 300, fontStyle: 'italic', letterSpacing: -2 }}>Services</h2>
            </div>
          </div>
          {services.map(({ n, p, t }, i) => (
            <div key={n} className="group flex items-center justify-between py-5 hover:bg-white transition-colors duration-300 px-4 -mx-4"
              style={{ borderTop: i === 0 ? '1px solid #E8E4DF' : 'none', borderBottom: '1px solid #E8E4DF' }}>
              <div className="flex items-center gap-6">
                <span className="text-xs text-gray-200 w-5">{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, fontStyle: 'italic', color: '#2A2A2A' }}
                  className="group-hover:text-gray-900 transition-colors duration-300">{n}</span>
              </div>
              <div className="flex items-center gap-8">
                <span className="text-xs text-gray-300 hidden md:block tracking-wide">{t}</span>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, color: '#8A8078' }}>{p}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-300 mb-3">Work</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 300, fontStyle: 'italic', letterSpacing: -2 }} className="mb-14">Portfolio</h2>
          <div className="grid grid-cols-3 gap-2">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=600',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=600',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=600',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=600',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=600',
              'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=600',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: i === 1 || i === 4 ? '3/4' : '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.7)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: '#0D0B09' }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-600 mb-3">Contact</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 52, fontWeight: 300, fontStyle: 'italic', letterSpacing: -2, color: 'white' }} className="mb-14">Book</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={15} />, lines: ['9 Rue Cambon', 'Paris, 75001'] },
                { icon: <Phone size={15} />, lines: ['+33 1 42 61 0176'] },
                { icon: <Mail size={15} />, lines: ['book@blanc.studio'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 9am – 8pm', 'By appointment only'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div className="text-gray-600 mt-0.5">{icon}</div>
                  <div>{lines.map(l => <p key={l} className="text-gray-500 text-sm leading-6">{l}</p>)}</div>
                </div>
              ))}
              <a href="#" className="w-9 h-9 border border-gray-900 inline-flex items-center justify-center hover:border-gray-600 transition-colors duration-300 text-gray-700 hover:text-gray-400">
                <Instagram size={14} />
              </a>
            </div>
            <div>
              {['Name', 'Email', 'Phone', 'Service'].map(p => (
                <input key={p} placeholder={p.toUpperCase()}
                  className="w-full border-b border-gray-800 bg-transparent py-4 text-xs text-gray-300 placeholder:text-gray-800 outline-none focus:border-gray-500 transition-colors duration-300 mb-5 tracking-[0.2em]"
                  style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }} />
              ))}
              <button className="w-full py-4 text-xs uppercase tracking-[0.25em] border border-white text-white hover:bg-white hover:text-black transition-all duration-300">
                Request Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#090807', borderTop: '1px solid #141210' }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Cormorant Garamond', serif", color: '#2A2520', fontSize: 18, fontStyle: 'italic', fontWeight: 300 }}>Blanc</span>
          <p className="text-gray-800 text-xs">&copy; {new Date().getFullYear()} Blanc Studio</p>
        </div>
      </footer>
    </div>
  );
}
