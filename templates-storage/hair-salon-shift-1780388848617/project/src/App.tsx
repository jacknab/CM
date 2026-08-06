import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, Zap } from 'lucide-react';

const YELLOW = '#F5E118';
const BLACK = '#0A0A0A';
const OFFWHITE = '#F0EEE8';
const GRAY = '#888';

const services = [
  { num: '—01', name: 'THE CUT', price: '$95' },
  { num: '—02', name: 'ROOT TO TIP COLOUR', price: '$190+' },
  { num: '—03', name: 'BALAYAGE SYSTEM', price: '$240+' },
  { num: '—04', name: 'BOND REPAIR', price: '$110' },
  { num: '—05', name: 'BLOWOUT FINISH', price: '$65' },
  { num: '—06', name: 'MEN\'S DESIGN CUT', price: '$75' },
  { num: '—07', name: 'SCALP TREATMENT', price: '$80' },
  { num: '—08', name: 'EXTENSIONS CONSULT', price: 'POA' },
];

const heroImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
];

export default function App() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 5000);
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
    <div style={{ background: BLACK, color: OFFWHITE }} className="overflow-x-hidden">
      <style>{`
        @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
      `}</style>

      {/* NAV */}
      <nav style={{ borderBottom: `1px solid ${scrolled ? '#1C1C1C' : 'transparent'}` }}
        className="fixed top-0 left-0 right-0 z-50 bg-black transition-all duration-300 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Zap size={18} style={{ color: YELLOW }} strokeWidth={2.5} />
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: 6, color: OFFWHITE }}>SHIFT</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'work', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: GRAY, fontSize: 11, letterSpacing: 4 }}
                className="uppercase hover:text-white transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: YELLOW, color: BLACK, fontSize: 11, letterSpacing: 4 }}
              className="uppercase px-7 py-2.5 font-semibold hover:bg-yellow-300 transition-colors duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: OFFWHITE }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ borderTop: `1px solid #1C1C1C` }} className="md:hidden px-8 py-5 space-y-4 bg-black">
            {['about', 'services', 'work', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: GRAY }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-1500"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '1500ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
            <div className="absolute inset-0 bg-black/75" />
          </div>
        ))}
        {/* Yellow accent block */}
        <div className="absolute top-0 right-0 z-10 w-2 h-full" style={{ background: YELLOW }} />
        <div className="relative z-10 h-full flex items-end pb-20 px-8 md:px-20">
          <div>
            <p style={{ color: YELLOW, letterSpacing: 8, fontSize: 11, marginBottom: 16 }} className="uppercase">Hair Studio · NYC</p>
            <h1 style={{ fontSize: 'clamp(64px, 14vw, 180px)', fontWeight: 700, lineHeight: 0.85, letterSpacing: -6 }}
              className="mb-8">
              SHIFT.
            </h1>
            <p style={{ color: '#888', fontSize: 16, lineHeight: 1.6, maxWidth: 440, marginBottom: 32 }}>
              Uncompromising technique. Fearless colour. The kind of hair that makes people stop and look twice.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: YELLOW, color: BLACK, letterSpacing: 4, fontSize: 11 }}
                className="uppercase px-8 py-4 font-semibold hover:bg-yellow-300 transition-colors duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('work')}
                style={{ border: `1px solid #333`, color: GRAY, letterSpacing: 4, fontSize: 11 }}
                className="uppercase px-8 py-4 hover:border-white hover:text-white transition-colors duration-300">
                Our Work
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* TICKER */}
      <div style={{ background: YELLOW, overflow: 'hidden', height: 44 }} className="flex items-center">
        <div style={{ display: 'flex', animation: 'ticker 20s linear infinite', whiteSpace: 'nowrap' }}>
          {[...Array(10)].map((_, i) => (
            <span key={i} style={{ color: BLACK, fontWeight: 700, letterSpacing: 6, fontSize: 12, marginRight: 60 }} className="uppercase">
              SHIFT · HAIR STUDIO · NYC · PRECISION CUTS · FEARLESS COLOUR · SHIFT ·
            </span>
          ))}
        </div>
      </div>

      {/* ABOUT */}
      <section id="about" style={{ background: '#111' }} className="py-28 px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p style={{ color: YELLOW, letterSpacing: 6, fontSize: 11 }} className="uppercase mb-6">Who We Are</p>
            <h2 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 700, lineHeight: 0.9, letterSpacing: -3 }} className="mb-8">
              WE MAKE<br />HAIR<br />MATTER.
            </h2>
            <p style={{ color: '#666', lineHeight: 1.8, fontSize: 15, maxWidth: 480 }} className="mb-6">
              SHIFT is a collective of nine senior stylists who trained at the world's most progressive hair schools. We don't do average. We push every cut, every colour, to its absolute best.
            </p>
            <p style={{ color: '#666', lineHeight: 1.8, fontSize: 15, maxWidth: 480 }} className="mb-10">
              Our three-floor studio on the Lower East Side is where New York's most style-conscious clients come to make a statement.
            </p>
            <div className="grid grid-cols-3 gap-6">
              {[['9', 'Senior Artists'], ['2K+', 'Clients'], ['★4.9', 'Reviews']].map(([n, l]) => (
                <div key={l} style={{ borderLeft: `2px solid ${YELLOW}`, paddingLeft: 16 }}>
                  <p style={{ fontSize: 32, fontWeight: 700, color: OFFWHITE }}>{n}</p>
                  <p style={{ color: GRAY, fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src="https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=900&q=85"
              className="w-full object-cover" style={{ aspectRatio: '3/4' }} alt="" />
            <div style={{ position: 'absolute', bottom: -3, right: -3, width: '60%', height: 4, background: YELLOW }} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: BLACK }} className="py-24 px-8">
        <div className="max-w-5xl mx-auto">
          <div className="flex justify-between items-end mb-14">
            <h2 style={{ fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 700, letterSpacing: -2 }}>SERVICES</h2>
            <p style={{ color: GRAY, fontSize: 12, letterSpacing: 2 }} className="uppercase">All prices from</p>
          </div>
          {services.map(({ num, name, price }) => (
            <div key={num} className="group flex items-center justify-between py-5 cursor-default"
              style={{ borderBottom: '1px solid #1C1C1C' }}>
              <div className="flex items-center gap-8">
                <span style={{ color: YELLOW, fontSize: 11, letterSpacing: 2, fontWeight: 700 }}>{num}</span>
                <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: -0.5 }}
                  className="group-hover:text-yellow-300 transition-colors duration-300">{name}</span>
              </div>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#888' }}
                className="group-hover:text-yellow-300 transition-colors duration-300">{price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* WORK */}
      <section id="work" style={{ background: '#0A0A0A' }} className="py-24 px-8">
        <h2 style={{ fontSize: 'clamp(32px, 5vw, 60px)', fontWeight: 700, letterSpacing: -2 }} className="max-w-7xl mx-auto mb-12">WORK</h2>
        <div className="max-w-7xl mx-auto grid grid-cols-3 md:grid-cols-4 gap-2">
          {[
            'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=500',
            'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
          ].map((src, i) => (
            <div key={i} className="overflow-hidden group" style={{ aspectRatio: '1/1' }}>
              <img src={src} alt="" className="w-full h-full object-cover transition-all duration-500 group-hover:scale-105 group-hover:brightness-110" />
            </div>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: '#111' }} className="py-24 px-8">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-20">
          <div>
            <h2 style={{ fontSize: 'clamp(36px, 6vw, 72px)', fontWeight: 700, letterSpacing: -3, lineHeight: 0.9 }} className="mb-12">
              LET'S<br />BOOK.
            </h2>
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['84 Orchard Street', 'New York, NY 10002'] },
                { icon: <Phone size={16} />, lines: ['(212) 555-0108'] },
                { icon: <Mail size={16} />, lines: ['book@shifthair.nyc'] },
                { icon: <Clock size={16} />, lines: ['Tue–Sat: 10am – 9pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: YELLOW }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: GRAY, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #222`, color: GRAY }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-yellow-400 hover:text-yellow-400 transition-colors duration-300 mt-4">
                <Instagram size={16} />
              </a>
            </div>
          </div>
          <div>
            {['Name', 'Email', 'Phone', 'Service'].map(p => (
              <input key={p} placeholder={p.toUpperCase()}
                style={{ background: '#1A1A1A', border: 'none', borderBottom: '1px solid #222', color: OFFWHITE, display: 'block', width: '100%', padding: '14px 0', marginBottom: 20, outline: 'none', fontSize: 13, letterSpacing: 2 }}
                className="placeholder:text-gray-800 focus:border-yellow-500 transition-colors duration-300" />
            ))}
            <button style={{ background: YELLOW, color: BLACK, letterSpacing: 6, fontSize: 11, width: '100%', padding: '16px 0' }}
              className="uppercase font-bold hover:bg-yellow-300 transition-colors duration-300">
              Book Now
            </button>
          </div>
        </div>
      </section>

      <footer style={{ background: '#060606', borderTop: `2px solid ${YELLOW}` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Zap size={14} style={{ color: YELLOW }} strokeWidth={2.5} />
            <span style={{ fontWeight: 700, letterSpacing: 6, fontSize: 12 }}>SHIFT</span>
          </div>
          <p style={{ color: '#333', fontSize: 12, letterSpacing: 1 }}>&copy; {new Date().getFullYear()} SHIFT Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
