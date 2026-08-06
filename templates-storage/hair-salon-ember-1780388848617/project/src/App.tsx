import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, Flame } from 'lucide-react';

const CHARCOAL = '#1C1C1C';
const DARK2 = '#252525';
const ORANGE = '#E8581A';
const AMBER = '#F0A040';
const ASH = '#7A7A7A';
const LIGHT = '#F0EDE8';

const services = [
  { name: 'The Ember Cut', price: '$96', hot: true },
  { name: 'Flame Balayage', price: '$235+', hot: true },
  { name: 'Copper Colour', price: '$185+', hot: false },
  { name: 'Bond Restoration', price: '$105', hot: false },
  { name: 'Blowout & Finish', price: '$68', hot: false },
  { name: 'Men\'s Design Cut', price: '$80', hot: false },
  { name: 'Root Regrowth', price: '$95', hot: false },
  { name: 'Scalp Detox', price: '$82', hot: false },
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
    <div style={{ background: CHARCOAL, color: LIGHT }} className="overflow-x-hidden">

      <nav style={{ background: scrolled ? 'rgba(28,28,28,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid #2A2A2A` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Flame size={20} style={{ color: ORANGE }} strokeWidth={1.5} />
            <span style={{ fontSize: 20, fontWeight: 300, letterSpacing: 4, color: LIGHT }}>EMBER</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} style={{ color: ASH, fontSize: 11, letterSpacing: 4 }}
                className="uppercase hover:text-orange-400 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} style={{ background: ORANGE, color: 'white', letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-7 py-2.5 hover:opacity-90 transition-opacity duration-300">Book</button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: ASH }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: DARK2, borderTop: `1px solid #2A2A2A` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: ASH }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
          className="absolute inset-0 w-full h-full object-cover" style={{ filter: 'grayscale(40%) contrast(1.2)' }} alt="" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(28,28,28,0.92) 0%, rgba(28,28,28,0.7) 60%, rgba(232,88,26,0.2) 100%)` }} />
        {/* Ember accent line */}
        <div className="absolute right-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, transparent, ${ORANGE}, transparent)` }} />
        <div className="relative z-10 h-full flex items-center px-8 md:px-20">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Flame size={16} style={{ color: ORANGE }} strokeWidth={1.5} />
              <p style={{ color: ORANGE, letterSpacing: 6, fontSize: 11, fontWeight: 300 }} className="uppercase">Hair Studio</p>
            </div>
            <h1 style={{ fontFamily: "'Merriweather', serif", fontSize: 'clamp(52px, 9vw, 120px)', color: LIGHT, lineHeight: 0.9, fontStyle: 'italic', fontWeight: 300 }}
              className="mb-8">
              Burn<br />bright.
            </h1>
            <div style={{ width: 60, height: 2, background: `linear-gradient(to right, ${ORANGE}, ${AMBER})`, marginBottom: 24 }} />
            <p style={{ color: ASH, lineHeight: 1.8, fontSize: 16, maxWidth: 440 }} className="mb-10">
              Ember is a hair studio for those who aren't afraid of making an impression. Warm, dramatic colour work and precision cuts for personalities that shine.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')} style={{ background: `linear-gradient(135deg, ${ORANGE}, ${AMBER})`, color: 'white' }}
                className="px-8 py-3.5 text-sm font-medium hover:opacity-90 transition-opacity duration-300">Book Now</button>
              <button onClick={() => scrollTo('services')} style={{ border: `1px solid #3A3A3A`, color: ASH }}
                className="px-8 py-3.5 text-sm hover:border-orange-700 hover:text-orange-400 transition-colors duration-300">Services</button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: DARK2 }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div style={{ width: 40, height: 3, background: `linear-gradient(to right, ${ORANGE}, ${AMBER})`, marginBottom: 24 }} />
            <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 'clamp(30px, 5vw, 56px)', color: LIGHT, fontStyle: 'italic', fontWeight: 300 }} className="mb-8 leading-tight">
              Colour with<br />heat in it.
            </h2>
            <p style={{ color: ASH, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Ember specialises in the warm, fiery end of the colour spectrum — coppers, russets, reds, ambers and burnished golds. Eight senior stylists, all trained in advanced warm colour techniques.
            </p>
            <p style={{ color: ASH, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              We don't do cool here. Our studio is warm, loud, and alive. Come as you are, leave as you want to be.
            </p>
            <div className="flex gap-10">
              {[['8', 'Stylists'], ['6+', 'Years'], ['1,600+', 'Clients']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Merriweather', serif", fontSize: 38, color: ORANGE, fontStyle: 'italic', fontWeight: 300 }}>{n}</p>
                  <p style={{ color: '#4A4A4A', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
            className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'sepia(20%) saturate(1.2)' }} alt="" />
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CHARCOAL }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-5 mb-14">
            <Flame size={20} style={{ color: ORANGE }} strokeWidth={1.5} />
            <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: LIGHT, fontStyle: 'italic', fontWeight: 300 }}>Services</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price, hot }) => (
              <div key={name} style={{ border: `1px solid ${hot ? ORANGE : '#2A2A2A'}`, background: hot ? 'rgba(232,88,26,0.04)' : 'transparent' }}
                className="p-5 flex justify-between items-center hover:border-orange-700 transition-colors duration-300 group">
                <div className="flex items-center gap-3">
                  {hot && <Flame size={12} style={{ color: ORANGE }} strokeWidth={1.5} />}
                  <span style={{ fontSize: 15, color: LIGHT, fontWeight: 300 }}
                    className="group-hover:text-orange-300 transition-colors duration-300">{name}</span>
                </div>
                <span style={{ fontFamily: "'Merriweather', serif", fontSize: 20, color: hot ? ORANGE : ASH, fontStyle: 'italic', fontWeight: 300 }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#141414' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: LIGHT, fontStyle: 'italic', fontWeight: 300 }} className="mb-12">Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'sepia(15%) contrast(1.1)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK2 }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 style={{ fontFamily: "'Merriweather', serif", fontSize: 44, color: LIGHT, fontStyle: 'italic', fontWeight: 300 }} className="mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={15} />, lines: ['44 Commercial Street', 'London, E1 6LT'] },
                { icon: <Phone size={15} />, lines: ['+44 20 7247 0154'] },
                { icon: <Mail size={15} />, lines: ['hello@ember.studio'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 10am – 8pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ORANGE }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: ASH, fontSize: 14 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #2A2A2A`, color: ASH }}
                className="w-10 h-10 inline-flex items-center justify-center hover:border-orange-700 hover:text-orange-500 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div>
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: CHARCOAL, border: '1px solid #2A2A2A', color: LIGHT, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-gray-800 focus:border-orange-700 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service desired..."
                style={{ background: CHARCOAL, border: '1px solid #2A2A2A', color: LIGHT, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-gray-800 focus:border-orange-700 transition-colors duration-300" />
              <button style={{ background: `linear-gradient(135deg, ${ORANGE}, ${AMBER})`, color: 'white', width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">Book Appointment</button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E0E0E', borderTop: `1px solid #1C1C1C` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Flame size={14} style={{ color: '#3A3A3A' }} strokeWidth={1.5} />
            <span style={{ color: '#3A3A3A', fontSize: 12, letterSpacing: 4 }}>EMBER</span>
          </div>
          <p style={{ color: '#2A2A2A', fontSize: 12 }}>&copy; {new Date().getFullYear()} Ember Studio</p>
        </div>
      </footer>
    </div>
  );
}
