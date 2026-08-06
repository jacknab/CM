import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const BURGUNDY = '#2D0F0F';
const WINE = '#4A1520';
const CHAMPAGNE = '#E8C97A';
const BLUSH = '#C4A882';
const CREAM = '#F5EFDF';

const services = [
  { cat: 'Cut & Style', items: [{ n: 'Signature Cut', p: '$115' }, { n: 'Cut & Blowdry', p: '$145' }, { n: 'Men\'s Luxury Cut', p: '$85' }] },
  { cat: 'Colour', items: [{ n: 'Full Colour', p: '$190+' }, { n: 'Balayage', p: '$245+' }, { n: 'Highlights', p: '$160+' }] },
  { cat: 'Treatments', items: [{ n: 'Olaplex Treatment', p: '$95' }, { n: 'Scalp Ritual', p: '$80' }, { n: 'Keratin Smooth', p: '$250' }] },
];

const heroImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export default function App() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 7000);
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
    <div style={{ background: BURGUNDY, color: CREAM }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(45,15,15,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(10px)' : 'none', borderBottom: scrolled ? `1px solid #3A1818` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-6 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: CREAM, letterSpacing: 2 }}>Velvet Rose</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: BLUSH, fontSize: 12, letterSpacing: 2 }}
                className="uppercase hover:text-yellow-200 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid ${CHAMPAGNE}`, color: CHAMPAGNE, letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-6 py-2.5 hover:bg-yellow-900/20 transition-colors duration-300">
              Reserve
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: BLUSH }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: WINE, borderTop: `1px solid #3A1818` }} className="md:hidden px-8 py-5 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block uppercase text-xs tracking-widest" style={{ color: BLUSH }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-3000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '3000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, rgba(45,15,15,0.85) 0%, rgba(74,21,32,0.7) 100%)` }} />
          </div>
        ))}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <p style={{ color: CHAMPAGNE, letterSpacing: 8, fontSize: 11 }} className="uppercase mb-6">Luxury Hair Salon</p>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(48px, 8vw, 110px)', color: CREAM, lineHeight: 1 }}
            className="font-normal mb-6">
            Velvet<br /><em>Rose</em>
          </h1>
          <div style={{ width: 80, height: 1, background: CHAMPAGNE, opacity: 0.6 }} className="mb-8" />
          <p style={{ color: '#D4BEAD', lineHeight: 1.8, fontSize: 15, maxWidth: 440 }} className="mb-12">
            An intimate sanctuary for elevated hair artistry. Where luxury is in the details, and every guest is treated as a muse.
          </p>
          <div className="flex gap-5">
            <button onClick={() => scrollTo('services')}
              style={{ background: CHAMPAGNE, color: BURGUNDY, letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-8 py-3.5 font-medium hover:opacity-90 transition-opacity duration-300">
              Explore Services
            </button>
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid rgba(232,201,122,0.3)`, color: BLUSH, letterSpacing: 3, fontSize: 11 }}
              className="uppercase px-8 py-3.5 hover:bg-white/5 transition-colors duration-300">
              Book Now
            </button>
          </div>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex gap-3">
          {heroImages.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)}
              style={{ width: i === slide ? 28 : 8, height: 2, background: i === slide ? CHAMPAGNE : 'rgba(232,201,122,0.3)' }}
              className="transition-all duration-500" />
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: WINE }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: CHAMPAGNE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Our Story</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 'clamp(30px, 4vw, 52px)', color: CREAM }} className="leading-tight mb-8">
              An Intimate Salon<br /><em>Experience</em>
            </h2>
            <div style={{ width: 40, height: 1, background: CHAMPAGNE, opacity: 0.5 }} className="mb-8" />
            <p style={{ color: '#C4AEAD', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Born from a deep passion for the transformative power of hair, Velvet Rose was founded to give every client the unhurried, devoted attention they deserve.
            </p>
            <p style={{ color: '#C4AEAD', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Our seven-chair boutique salon is intentionally intimate — no more appointments than we can honour with complete attention. Your experience is never rushed.
            </p>
            <div className="flex gap-12">
              {[['8+', 'Master Stylists'], ['15+', 'Years Est.'], ['5★', 'Average Rating']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 36, color: CHAMPAGNE }}>{n}</p>
                  <p style={{ color: BLUSH, fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
              className="w-full object-cover rounded-sm" style={{ aspectRatio: '3/4' }} alt="" />
            <div className="mt-12">
              <img src="https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
                className="w-full object-cover rounded-sm" style={{ aspectRatio: '3/4' }} alt="" />
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: BURGUNDY }} className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p style={{ color: CHAMPAGNE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-4">Menu</p>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 48, color: CREAM }}>Services</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {services.map(({ cat, items }) => (
              <div key={cat} style={{ border: `1px solid #3A1818`, borderRadius: 4 }} className="p-8">
                <div className="flex items-center gap-3 mb-8">
                  <div style={{ width: 20, height: 1, background: CHAMPAGNE }} />
                  <p style={{ color: CHAMPAGNE, letterSpacing: 3, fontSize: 11 }} className="uppercase">{cat}</p>
                </div>
                <div className="space-y-5">
                  {items.map(({ n, p }) => (
                    <div key={n} className="flex justify-between items-center">
                      <span style={{ color: '#D4BEAD', fontSize: 15 }}>{n}</span>
                      <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: CHAMPAGNE }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WINE }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: CHAMPAGNE, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, color: CREAM }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-all duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: '#1E0A0A' }} className="py-28 px-6">
        <div className="max-w-5xl mx-auto text-center mb-14">
          <p style={{ color: CHAMPAGNE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-4">Reserve Your Visit</p>
          <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 48, color: CREAM }}>Contact Us</h2>
        </div>
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16">
          <div className="space-y-8">
            {[
              { icon: <MapPin size={16} />, text: ['28 Marylebone Lane', 'London, W1U 2PG'] },
              { icon: <Phone size={16} />, text: ['+44 20 7224 0180'] },
              { icon: <Mail size={16} />, text: ['reserve@velvetrose.co.uk'] },
              { icon: <Clock size={16} />, text: ['Tue–Sat: 9am – 8pm', 'Sun: 10am – 5pm'] },
            ].map(({ icon, text }, i) => (
              <div key={i} className="flex gap-5">
                <div style={{ color: CHAMPAGNE, marginTop: 2 }}>{icon}</div>
                <div>{text.map(t => <p key={t} style={{ color: BLUSH, fontSize: 15 }}>{t}</p>)}</div>
              </div>
            ))}
            <a href="#" style={{ border: `1px solid #3A1818`, color: BLUSH }}
              className="w-10 h-10 flex items-center justify-center hover:border-yellow-700 hover:text-yellow-400 transition-colors duration-300">
              <Instagram size={16} />
            </a>
          </div>
          <div style={{ background: WINE, border: `1px solid #3A1818` }} className="p-8 rounded-sm">
            {['Full Name', 'Email', 'Phone'].map(p => (
              <input key={p} placeholder={p}
                style={{ background: 'transparent', borderBottom: `1px solid #3A1818`, color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 20, outline: 'none', fontSize: 14 }}
                className="placeholder:text-gray-700 focus:border-yellow-700 transition-colors duration-300" />
            ))}
            <textarea placeholder="Desired service..."
              style={{ background: 'transparent', borderBottom: `1px solid #3A1818`, color: CREAM, display: 'block', width: '100%', padding: '12px 0', marginBottom: 24, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
              className="placeholder:text-gray-700 focus:border-yellow-700 transition-colors duration-300" />
            <button style={{ background: CHAMPAGNE, color: BURGUNDY, letterSpacing: 3, fontSize: 11, width: '100%', padding: '14px 0' }}
              className="uppercase font-medium hover:opacity-90 transition-opacity duration-300">
              Request Reservation
            </button>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E0404', borderTop: `1px solid #1E0A0A` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Playfair Display', serif", color: CHAMPAGNE, fontSize: 15 }}>Velvet Rose</span>
          <p style={{ color: '#3A1818', fontSize: 12 }}>&copy; {new Date().getFullYear()} Velvet Rose Salon. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
