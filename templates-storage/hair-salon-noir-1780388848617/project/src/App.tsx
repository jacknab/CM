import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, ChevronRight } from 'lucide-react';

const GOLD = '#C9A84C';
const GOLD_LIGHT = '#E8C97A';
const DARK = '#0A0A0A';
const DARK2 = '#111111';
const DARK3 = '#1A1A1A';

const heroImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
];

const services = [
  { num: '01', name: 'Precision Cut', price: '$85' },
  { num: '02', name: 'Color & Balayage', price: '$180+' },
  { num: '03', name: 'Keratin Treatment', price: '$220' },
  { num: '04', name: 'Toning & Gloss', price: '$95' },
  { num: '05', name: 'Blowout & Style', price: '$65' },
  { num: '06', name: 'Scalp Treatment', price: '$75' },
  { num: '07', name: 'Extensions Consult', price: '$50' },
  { num: '08', name: 'Brow Shaping', price: '$35' },
];

const gallery = [
  'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/2770660/pexels-photo-2770660.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/1832329/pexels-photo-1832329.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3992672/pexels-photo-3992672.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
];

export default function App() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 6000);
    return () => clearInterval(t);
  }, []);

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
    <div style={{ background: DARK, color: '#E8E8E0' }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? DARK2 : 'transparent', borderBottom: scrolled ? `1px solid #222` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-3">
            <div style={{ width: 2, height: 32, background: GOLD }} />
            <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: '#F0EDE6', letterSpacing: 4 }}
              className="font-light tracking-widest uppercase">Noir Studio</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#A0A09A', letterSpacing: 3, fontSize: 11 }}
                className="uppercase hover:text-white transition-colors duration-300 tracking-widest">
                {s}
              </button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: 'transparent', border: `1px solid ${GOLD}`, color: GOLD_LIGHT }}
              className="px-6 py-2 text-xs uppercase tracking-widest hover:bg-yellow-900/20 transition-colors duration-300">
              Book Now
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: '#DDD' }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: DARK2, borderTop: '1px solid #222' }} className="md:hidden px-8 py-6 space-y-5">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block w-full text-left"
                style={{ color: '#A0A09A', letterSpacing: 3, fontSize: 12 }}>{s.toUpperCase()}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-2000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '2000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.72)' }} />
          </div>
        ))}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <p style={{ color: GOLD, letterSpacing: 8, fontSize: 11 }} className="uppercase mb-6">Artisan Hair Atelier</p>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(52px, 9vw, 120px)', color: '#F0EDE6', lineHeight: 0.9 }}
            className="font-light mb-8">
            Noir<br /><em>Studio</em>
          </h1>
          <div style={{ width: 80, height: 1, background: GOLD }} className="mb-8" />
          <p style={{ color: '#B0ADA8', letterSpacing: 2, fontSize: 14, maxWidth: 420 }} className="leading-relaxed mb-10">
            Where darkness meets precision. Exclusive hair artistry for those who demand the extraordinary.
          </p>
          <button onClick={() => scrollTo('services')}
            style={{ border: `1px solid ${GOLD}`, color: GOLD_LIGHT, letterSpacing: 4, fontSize: 11 }}
            className="uppercase px-8 py-3.5 hover:bg-yellow-900/20 transition-all duration-300 flex items-center gap-3">
            Explore Services <ChevronRight size={14} />
          </button>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {heroImages.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)}
              style={{ width: i === slide ? 24 : 6, height: 2, background: i === slide ? GOLD : '#444' }}
              className="transition-all duration-500" />
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: DARK2 }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div className="relative">
            <img src="https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              alt="Noir Studio" className="w-full object-cover" style={{ aspectRatio: '4/5', filter: 'grayscale(20%)' }} />
            <div style={{ position: 'absolute', top: -12, left: -12, right: 12, bottom: 12, border: `1px solid ${GOLD}`, pointerEvents: 'none', zIndex: 0 }} />
          </div>
          <div>
            <p style={{ color: GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase mb-5">Our Philosophy</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(32px, 5vw, 52px)', color: '#F0EDE6' }}
              className="font-light leading-tight mb-8">The Art of<br /><em>Transformation</em></h2>
            <div style={{ width: 40, height: 1, background: GOLD }} className="mb-8" />
            <p style={{ color: '#8A8A84', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Noir Studio is more than a salon — it is an experience. Each visit is a curated ritual, merging technical mastery with a deep understanding of your unique identity.
            </p>
            <p style={{ color: '#8A8A84', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Our principal stylists have trained across London, Tokyo, and New York, bringing an unparalleled global perspective to every cut, color, and transformation.
            </p>
            <div className="grid grid-cols-3 gap-8">
              {[['12+', 'Years'], ['2K+', 'Clients'], ['8', 'Stylists']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 38, color: GOLD_LIGHT }} className="font-light">{n}</p>
                  <p style={{ color: '#666', letterSpacing: 2, fontSize: 10 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: DARK3 }} className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-6 mb-16">
            <div style={{ flex: 1, height: 1, background: '#222' }} />
            <div>
              <p style={{ color: GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase text-center mb-2">Our Services</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, color: '#F0EDE6' }} className="font-light text-center">Service Menu</h2>
            </div>
            <div style={{ flex: 1, height: 1, background: '#222' }} />
          </div>
          <div className="space-y-0">
            {services.map(({ num, name, price }) => (
              <div key={num} className="group flex items-center justify-between py-5 cursor-default"
                style={{ borderBottom: '1px solid #1C1C1C' }}>
                <div className="flex items-center gap-8">
                  <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, color: '#333' }}>{num}</span>
                  <span style={{ fontSize: 16, color: '#C8C5BE', letterSpacing: 1 }}
                    className="group-hover:text-white transition-colors duration-300">{name}</span>
                </div>
                <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: GOLD }} className="font-light">{price}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <button onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
              style={{ background: GOLD, color: DARK, letterSpacing: 4, fontSize: 11 }}
              className="uppercase px-10 py-4 hover:opacity-90 transition-opacity duration-300 font-medium">
              Book Your Appointment
            </button>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: DARK2 }} className="py-28 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase text-center mb-2">Portfolio</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, color: '#F0EDE6' }} className="font-light text-center mb-14">Our Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden group cursor-pointer" style={{ aspectRatio: i % 3 === 1 ? '4/5' : '1/1' }}>
                <img src={src} alt="hair work" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105 group-hover:filter"
                  style={{ filter: 'grayscale(30%)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <p style={{ color: GOLD, letterSpacing: 6, fontSize: 10 }} className="uppercase text-center mb-2">Visit Us</p>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 44, color: '#F0EDE6' }} className="font-light text-center mb-16">Contact & Hours</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-10">
              {[
                { icon: <MapPin size={16} />, label: 'Address', text: ['142 West 57th Street', 'New York, NY 10019'] },
                { icon: <Phone size={16} />, label: 'Phone', text: ['(212) 555-0190'] },
                { icon: <Mail size={16} />, label: 'Email', text: ['hello@noirstudio.com'] },
                { icon: <Clock size={16} />, label: 'Hours', text: ['Tue–Fri: 10am – 8pm', 'Sat: 9am – 7pm', 'Sun–Mon: Closed'] },
              ].map(({ icon, label, text }) => (
                <div key={label} className="flex gap-5 items-start">
                  <div style={{ color: GOLD, marginTop: 2 }}>{icon}</div>
                  <div>
                    <p style={{ color: '#444', letterSpacing: 3, fontSize: 10 }} className="uppercase mb-2">{label}</p>
                    {text.map(t => <p key={t} style={{ color: '#A0A09A', fontSize: 15 }}>{t}</p>)}
                  </div>
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <a href="#" style={{ border: `1px solid #222`, color: '#666' }}
                  className="w-10 h-10 flex items-center justify-center hover:border-yellow-700 hover:text-yellow-600 transition-colors duration-300">
                  <Instagram size={16} />
                </a>
              </div>
            </div>
            <div style={{ background: DARK2, border: '1px solid #1C1C1C' }} className="p-8">
              <p style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, color: '#F0EDE6' }} className="font-light mb-6">Request an Appointment</p>
              {['Full Name', 'Email Address', 'Phone Number'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#111', border: '1px solid #222', color: '#CCC', letterSpacing: 1 }}
                  className="w-full px-4 py-3 mb-4 text-sm outline-none focus:border-yellow-700 transition-colors duration-300 placeholder:text-gray-700" />
              ))}
              <textarea placeholder="Tell us about the service you'd like..."
                style={{ background: '#111', border: '1px solid #222', color: '#CCC' }}
                className="w-full px-4 py-3 mb-6 text-sm outline-none focus:border-yellow-700 transition-colors duration-300 placeholder:text-gray-700 resize-none h-28" />
              <button style={{ background: GOLD, color: DARK, letterSpacing: 4, fontSize: 11 }}
                className="w-full py-4 uppercase font-medium hover:opacity-90 transition-opacity duration-300">
                Send Request
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#060606', borderTop: '1px solid #111' }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <p style={{ fontFamily: "'Cormorant Garamond', serif", color: GOLD, letterSpacing: 4, fontSize: 14 }}>NOIR STUDIO</p>
          <p style={{ color: '#333', fontSize: 12, letterSpacing: 1 }}>
            &copy; {new Date().getFullYear()} Noir Studio. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
